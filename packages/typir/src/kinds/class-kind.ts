/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { assertUnreachable } from 'langium';
import { TypeEqualityProblem } from '../features/equality.js';
import { InferenceProblem, InferenceRuleNotApplicable } from '../features/inference.js';
import { SubTypeProblem } from '../features/subtype.js';
import { ValidationProblem, ValidationRuleWithBeforeAfter } from '../features/validation.js';
import { Type, isType } from '../graph/type-node.js';
import { TypirServices } from '../typir.js';
import { TypeSelector, TypirProblem, resolveTypeSelector } from '../utils/utils-definitions.js';
import { IndexedTypeConflict, MapListConverter, TypeCheckStrategy, checkNameTypesMap, checkValueForConflict, createKindConflict, createTypeCheckStrategy } from '../utils/utils-type-comparison.js';
import { assertTrue, assertType, toArray } from '../utils/utils.js';
import { CreateFunctionTypeDetails, FunctionKind, FunctionKindName, FunctionType, isFunctionKind, isFunctionType } from './function-kind.js';
import { Kind, isKind } from './kind.js';

export class ClassType extends Type {
    override readonly kind: ClassKind;
    readonly className: string;
    /** The super classes are readonly, since they might be used to calculate the identifier of the current class, which must be stable. */
    protected readonly superClasses: readonly ClassType[]; // if necessary, the array could be replaced by Map<string, ClassType>: name/form -> ClassType, for faster look-ups
    protected readonly subClasses: ClassType[] = []; // additional sub classes might be added later on!
    protected readonly fields: FieldDetails[];
    protected readonly methods: MethodDetails[];

    constructor(kind: ClassKind, identifier: string, typeDetails: ClassTypeDetails) {
        super(identifier);
        this.kind = kind;
        this.className = typeDetails.className;

        // resolve the super classes
        this.superClasses = toArray(typeDetails.superClasses).map(superr => {
            const cls = resolveTypeSelector(this.kind.services, superr);
            assertType(cls, isClassType);
            return cls;
        });
        // register this class as sub-class for all super-classes
        this.getDeclaredSuperClasses().forEach(superr => superr.subClasses.push(this));
        // check number of allowed super classes
        if (this.kind.options.maximumNumberOfSuperClasses >= 0) {
            if (this.kind.options.maximumNumberOfSuperClasses < this.getDeclaredSuperClasses().length) {
                throw new Error(`Only ${this.kind.options.maximumNumberOfSuperClasses} super-classes are allowed.`);
            }
        }
        // check for cycles in sub-type-relationships
        if (this.getAllSuperClasses(false).has(this)) {
            throw new Error(`Circles in super-sub-class-relationships are not allowed: ${this.getName()}`);
        }

        // fields
        this.fields = typeDetails.fields.map(field => <FieldDetails>{
            name: field.name,
            type: resolveTypeSelector(this.kind.services, field.type),
        });
        // check collisions of field names
        if (this.getFields(false).size !== typeDetails.fields.length) {
            throw new Error('field names must be unique!');
        }

        // methods
        this.methods = typeDetails.methods.map(method => {
            const methodType = this.kind.getFunctionKind().getOrCreateFunctionType(method);
            return <MethodDetails>{
                type: methodType,
            };
        });
        // TODO check uniqueness??
    }

    override getName(): string {
        return `${this.className}`;
    }

    override getUserRepresentation(): string {
        // fields
        const fields: string[] = [];
        for (const field of this.getFields(false).entries()) {
            fields.push(`${field[0]}: ${field[1].getName()}`);
        }
        // super classes
        const superClasses = this.getDeclaredSuperClasses();
        const extendedClasses = superClasses.length <= 0 ? '' : ` extends ${superClasses.map(c => c.getName()).join(', ')}`;
        // whole representation
        return `${this.className} { ${fields.join(', ')} }${extendedClasses}`;
    }

    override analyzeTypeEqualityProblems(otherType: Type): TypirProblem[] {
        if (isClassType(otherType)) {
            if (this.kind.options.typing === 'Structural') {
                // for structural typing:
                return checkNameTypesMap(this.getFields(true), otherType.getFields(true), // including fields of super-classes
                    (t1, t2) => this.kind.services.equality.getTypeEqualityProblem(t1, t2));
            } else if (this.kind.options.typing === 'Nominal') {
                // for nominal typing:
                return checkValueForConflict(this.identifier, otherType.identifier, 'name');
            } else {
                assertUnreachable(this.kind.options.typing);
            }
        } else {
            return [<TypeEqualityProblem>{
                $problem: TypeEqualityProblem,
                type1: this,
                type2: otherType,
                subProblems: [createKindConflict(otherType, this)],
            }];
        }
    }

    override analyzeIsSubTypeOf(superType: Type): TypirProblem[] {
        if (isClassType(superType)) {
            return this.analyzeSubTypeProblems(this, superType);
        } else {
            return [<SubTypeProblem>{
                $problem: SubTypeProblem,
                superType,
                subType: this,
                subProblems: [createKindConflict(this, superType)],
            }];
        }
    }

    override analyzeIsSuperTypeOf(subType: Type): TypirProblem[] {
        if (isClassType(subType)) {
            return this.analyzeSubTypeProblems(subType, this);
        } else {
            return [<SubTypeProblem>{
                $problem: SubTypeProblem,
                superType: this,
                subType,
                subProblems: [createKindConflict(subType, this)],
            }];
        }
    }

    protected analyzeSubTypeProblems(subType: ClassType, superType: ClassType): TypirProblem[] {
        if (this.kind.options.typing === 'Structural') {
            // for structural typing, the sub type needs to have all fields of the super type with assignable types (including fields of all super classes):
            const conflicts: IndexedTypeConflict[] = [];
            const subFields = subType.getFields(true);
            for (const [superFieldName, superFieldType] of superType.getFields(true)) {
                if (subFields.has(superFieldName)) {
                    // field is both in super and sub
                    const subFieldType = subFields.get(superFieldName)!;
                    const checkStrategy = createTypeCheckStrategy(this.kind.options.subtypeFieldChecking, this.kind.services);
                    const subTypeComparison = checkStrategy(subFieldType, superFieldType);
                    if (subTypeComparison !== undefined) {
                        conflicts.push({
                            $problem: IndexedTypeConflict,
                            expected: superType,
                            actual: subType,
                            propertyName: superFieldName,
                            subProblems: [subTypeComparison],
                        });
                    } else {
                        // everything is fine
                    }
                } else {
                    // missing sub field
                    conflicts.push({
                        $problem: IndexedTypeConflict,
                        expected: superFieldType,
                        actual: undefined,
                        propertyName: superFieldName,
                        subProblems: []
                    });
                }
            }
            // Note that it is not necessary to check, whether the sub class has additional fields than the super type!
            return conflicts;
        } else if (this.kind.options.typing === 'Nominal') {
            // for nominal typing (takes super classes into account)
            const allSub = subType.getAllSuperClasses(true);
            const globalResult: TypirProblem[] = [];
            for (const oneSub of allSub) {
                const localResult = this.kind.services.equality.getTypeEqualityProblem(superType, oneSub);
                if (localResult === undefined) {
                    return []; // class is found in the class hierarchy
                }
                globalResult.push(localResult); // return all conflicts, is that too much?
            }
            return globalResult;
        } else {
            assertUnreachable(this.kind.options.typing);
        }
    }

    getDeclaredSuperClasses(): readonly ClassType[] {
        return this.superClasses;
    }

    getDeclaredSubClasses(): ClassType[] {
        /* Design decision: properties vs edges (relevant also for other types)
        - for now, use properties, since they are often faster and are easier to implement
        - the alternative would be: return this.getOutgoingEdges('sub-classes'); // which is easier for graph traversal algorithms
        */
        return this.subClasses;
    }

    getAllSuperClasses(includingGivenClass: boolean = false): Set<ClassType> {
        const result = new Set<ClassType>();
        if (includingGivenClass) {
            result.add(this);
        }
        const toadd = [...this.getDeclaredSuperClasses()];
        while (toadd.length >= 1) {
            const current = toadd.pop()!;
            if (result.has(current)) {
                // nothing to do
            } else {
                // found a new super class
                result.add(current);
                // ... and add its super classes as well
                toadd.push(...current.getDeclaredSuperClasses());
            }
        }
        return result;
        // Sets preserve insertion order:
        // return Array.from(set);
    }

    getAllSubClasses(includingGivenClass: boolean = false): Set<ClassType> {
        const result = new Set<ClassType>();
        if (includingGivenClass) {
            result.add(this);
        }
        const toadd = [...this.getDeclaredSubClasses()];
        while (toadd.length >= 1) {
            const current = toadd.pop()!;
            if (result.has(current)) {
                // nothing to do
            } else {
                // found a new sub class
                result.add(current);
                // ... and add its sub classes as well
                toadd.push(...current.getDeclaredSubClasses());
            }
        }
        return result;
    }

    getFields(withSuperClassesFields: boolean): Map<string, Type> {
        // in case of conflicting field names, the type of the sub-class takes precedence! TODO check this
        const result = new Map();
        // fields of super classes
        if (withSuperClassesFields) {
            for (const superClass of this.getDeclaredSuperClasses()) {
                for (const [superName, superType] of superClass.getFields(true)) {
                    result.set(superName, superType);
                }
            }
        }
        // own fields
        this.fields.forEach(edge => {
            result.set(edge.name, edge.type);
        });
        return result;
    }

    getMethods(withSuperClassMethods: boolean): FunctionType[] {
        // own methods
        const result: FunctionType[] = this.methods.map(m => m.type);
        // methods of super classes
        if (withSuperClassMethods) {
            for (const superClass of this.getDeclaredSuperClasses()) {
                for (const superMethod of superClass.getMethods(true)) {
                    result.push(superMethod);
                }
            }
        }
        return result;
    }

}

export function isClassType(type: unknown): type is ClassType {
    return isType(type) && isClassKind(type.kind);
}



export interface ClassKindOptions {
    typing: 'Structural' | 'Nominal', // JS classes are nominal, TS structures are structural
    /** Values < 0 indicate an arbitrary number of super classes. */
    maximumNumberOfSuperClasses: number,
    subtypeFieldChecking: TypeCheckStrategy,
    /** Will be used only internally as prefix for the unique identifiers for class type names. */
    identifierPrefix: string,
}

export const ClassKindName = 'ClassKind';

export interface FieldDetails {
    name: string;
    type: Type;
}
export interface CreateFieldDetails {
    name: string;
    type: TypeSelector;
}

export interface MethodDetails {
    type: FunctionType;
    // methods might have some more properties in the future
}

export interface ClassTypeDetails<T = unknown> {
    className: string,
    superClasses?: TypeSelector | TypeSelector[],
    fields: CreateFieldDetails[],
    methods: Array<CreateFunctionTypeDetails<T>>, // all details of functions can be configured for methods as well, in particular, inference rules for function/method calls!
}
export interface CreateClassTypeDetails<T = unknown, T1 = unknown, T2 = unknown> extends ClassTypeDetails<T> { // TODO the generics look very bad!
    inferenceRuleForDeclaration?: (domainElement: unknown) => boolean, // TODO what is the purpose for this? what is the difference to literals?
    inferenceRuleForLiteral?: InferClassLiteral<T1>, // InferClassLiteral<T> | Array<InferClassLiteral<T>>, does not work: https://stackoverflow.com/questions/65129070/defining-an-array-of-differing-generic-types-in-typescript
    inferenceRuleForReference?: InferClassLiteral<T2>,
    inferenceRuleForFieldAccess?: (domainElement: unknown) => string | unknown | InferenceRuleNotApplicable, // name of the field | element to infer the type of the field (e.g. the type) | rule not applicable
}

// TODO nominal vs structural typing ??
export type InferClassLiteral<T = unknown> = {
    filter: (domainElement: unknown) => domainElement is T;
    matching: (domainElement: T) => boolean;
    inputValuesForFields: (domainElement: T) => Map<string, unknown>; // simple field name (including inherited fields) => value for this field! TODO implement that, [] for nominal typing
};


/**
 * Classes have a name and have an arbitrary number of fields, consisting of a name and a type, and an arbitrary number of super-classes.
 * Fields have exactly one type and no multiplicity (which can be realized with a type of kind 'MultiplicityKind').
 * Fields have exactly one name which must be unique for the current class (TODO what about same field names in extended class?).
 * The field name is used to identify fields of classes.
 * The order of fields is not defined, i.e. there is no order of fields.
 */
export class ClassKind implements Kind {
    readonly $name: 'ClassKind';
    readonly services: TypirServices;
    readonly options: ClassKindOptions;

    constructor(services: TypirServices, options?: Partial<ClassKindOptions>) {
        this.$name = ClassKindName;
        this.services = services;
        this.services.kinds.register(this);
        this.options = {
            // the default values:
            typing: 'Nominal',
            maximumNumberOfSuperClasses: 1,
            subtypeFieldChecking: 'EQUAL_TYPE',
            identifierPrefix: 'class',
            // the actually overriden values:
            ...options
        };
        assertTrue(this.options.maximumNumberOfSuperClasses >= 0); // no negative values
    }

    getClassType<T>(typeDetails: ClassTypeDetails<T> | string): ClassType | undefined { // string for nominal typing
        const key = this.calculateIdentifier(typeof typeDetails === 'string' ? { className: typeDetails, fields: [], methods: [] } : typeDetails);
        return this.services.graph.getType(key) as ClassType;
    }

    getOrCreateClassType<T, T1, T2>(typeDetails: CreateClassTypeDetails<T, T1, T2>): ClassType {
        const classType = this.getClassType(typeDetails);
        if (classType) {
            this.registerInferenceRules(typeDetails, classType);
            return classType;
        }
        return this.createClassType(typeDetails);
    }

    createClassType<T, T1, T2>(typeDetails: CreateClassTypeDetails<T, T1, T2>): ClassType {
        assertTrue(this.getClassType(typeDetails) === undefined, `${typeDetails.className}`);

        // create the class type
        const classType = new ClassType(this, this.calculateIdentifier(typeDetails), typeDetails as CreateClassTypeDetails);
        this.services.graph.addNode(classType);

        // register inference rules
        this.registerInferenceRules<T, T1, T2>(typeDetails, classType);

        return classType;
    }

    protected registerInferenceRules<T, T1, T2>(typeDetails: CreateClassTypeDetails<T, T1, T2>, classType: ClassType) {
        if (typeDetails.inferenceRuleForDeclaration) {
            this.services.inference.addInferenceRule({
                inferTypeWithoutChildren(domainElement, _typir) {
                    if (typeDetails.inferenceRuleForDeclaration!(domainElement)) {
                        return classType;
                    } else {
                        return InferenceRuleNotApplicable;
                    }
                },
                inferTypeWithChildrensTypes(_domainElement, _childrenTypes, _typir) {
                    // TODO check values for fields for nominal typing!
                    return classType;
                },
            }, classType);
        }
        if (typeDetails.inferenceRuleForLiteral) {
            this.registerInferenceRuleForLiteral(typeDetails.inferenceRuleForLiteral, this, classType);
        }
        if (typeDetails.inferenceRuleForReference) {
            this.registerInferenceRuleForLiteral(typeDetails.inferenceRuleForReference, this, classType);
        }
        if (typeDetails.inferenceRuleForFieldAccess) {
            this.services.inference.addInferenceRule((domainElement, _typir) => {
                const result = typeDetails.inferenceRuleForFieldAccess!(domainElement);
                if (result === InferenceRuleNotApplicable) {
                    return InferenceRuleNotApplicable;
                } else if (typeof result === 'string') {
                    // get the type of the given field name
                    const fieldType = classType.getFields(true).get(result);
                    if (fieldType) {
                        return fieldType;
                    }
                    return <InferenceProblem>{
                        $problem: InferenceProblem,
                        domainElement,
                        inferenceCandidate: classType,
                        location: `unknown field '${result}'`,
                        // rule: this, // this does not work with functions ...
                        subProblems: [],
                    };
                } else {
                    return result; // do the type inference for this element instead
                }
            }, classType);
        }
    }

    protected registerInferenceRuleForLiteral<T>(rule: InferClassLiteral<T>, classKind: ClassKind, classType: ClassType): void {
        const mapListConverter = new MapListConverter();
        this.services.inference.addInferenceRule({
            inferTypeWithoutChildren(domainElement, _typir) {
                const result = rule.filter(domainElement);
                if (result) {
                    const matching = rule.matching(domainElement);
                    if (matching) {
                        const inputArguments = rule.inputValuesForFields(domainElement);
                        if (inputArguments.size >= 1) {
                            return mapListConverter.toList(inputArguments);
                        } else {
                            // there are no operands to check
                            return classType; // this case occurs only, if the current class has no fields (including fields of super types) or is nominally typed
                        }
                    } else {
                        // the domain element is slightly different
                    }
                } else {
                    // the domain element has a completely different purpose
                }
                // does not match at all
                return InferenceRuleNotApplicable;
            },
            inferTypeWithChildrensTypes(domainElement, childrenTypes, typir) {
                const allExpectedFields = classType.getFields(true);
                // this class type might match, to be sure, resolve the types of the values for the parameters and continue to step 2
                const checkedFieldsProblems = checkNameTypesMap(
                    mapListConverter.toMap(childrenTypes),
                    allExpectedFields,
                    createTypeCheckStrategy(classKind.options.subtypeFieldChecking, typir)
                );
                if (checkedFieldsProblems.length >= 1) {
                    // (only) for overloaded functions, the types of the parameters need to be inferred in order to determine an exact match
                    return <InferenceProblem>{
                        $problem: InferenceProblem,
                        domainElement,
                        inferenceCandidate: classType,
                        location: 'values for fields',
                        rule: this,
                        subProblems: checkedFieldsProblems,
                    };
                } else {
                    // the current function is not overloaded, therefore, the types of their parameters are not required => save time, ignore inference errors
                    return classType;
                }
            },
        }, classType);
    }

    calculateIdentifier<T>(typeDetails: ClassTypeDetails<T>): string {
        return this.printClassType(typeDetails);
    }

    protected printClassType<T>(typeDetails: ClassTypeDetails<T>): string {
        const prefix = this.options.identifierPrefix;
        if (this.options.typing === 'Structural') {
            // fields
            const fields: string[] = [];
            for (const [fieldNUmber, fieldDetails] of typeDetails.fields.entries()) {
                fields.push(`${fieldNUmber}:${fieldDetails.name}`);
            }
            // methods
            const methods: string[] = [];
            for (const method of typeDetails.methods) {
                const methodType = this.getFunctionKind().getOrCreateFunctionType(method);
                methods.push(methodType.identifier); // TODO is ".identifier" too strict here?
            }
            // super classes
            const superClasses = toArray(typeDetails.superClasses).map(selector => {
                const type = resolveTypeSelector(this.services, selector);
                assertType(type, isClassType);
                return type;
            });
            const extendedClasses = superClasses.length <= 0 ? '' : `-extends-${superClasses.map(c => c.identifier).join(',')}`;
            // whole representation
            return `${prefix}-${typeDetails.className}{${fields.join(',')}}{${methods.join(',')}}${extendedClasses}`;
        } else if (this.options.typing === 'Nominal') {
            return `${prefix}-${typeDetails.className}`;
        } else {
            assertUnreachable(this.options.typing);
        }
    }

    getFunctionKind(): FunctionKind {
        // ensure, that Typir uses the predefined 'function' kind
        const kind = this.services.kinds.get(FunctionKindName);
        return isFunctionKind(kind) ? kind : new FunctionKind(this.services);
    }

    getOrCreateAnyClassType(typeDetails: AnyClassTypeDetails): AnyClassType {
        return this.getAnyClassKind().getOrCreateAnyClassType(typeDetails);
    }

    getAnyClassKind(): AnyClassKind {
        // ensure, that Typir uses the predefined 'function' kind
        const kind = this.services.kinds.get(AnyClassKindName);
        return isAnyClassKind(kind) ? kind : new AnyClassKind(this.services);
    }

}

export function isClassKind(kind: unknown): kind is ClassKind {
    return isKind(kind) && kind.$name === ClassKindName;
}


/**
 * Predefined validation to produce errors, if the same class is declared more than once.
 * This is often relevant for nominally typed classes.
 */
export class UniqueClassValidation implements ValidationRuleWithBeforeAfter {
    protected readonly foundDeclarations: Map<string, unknown[]> = new Map();
    protected readonly services: TypirServices;
    protected readonly isRelevant: (domainElement: unknown) => boolean; // using this check improves performance a lot

    constructor(services: TypirServices, isRelevant: (domainElement: unknown) => boolean) {
        this.services = services;
        this.isRelevant = isRelevant;
    }

    beforeValidation(_domainRoot: unknown, _typir: TypirServices): ValidationProblem[] {
        this.foundDeclarations.clear();
        return [];
    }

    validation(domainElement: unknown, _typir: TypirServices): ValidationProblem[] {
        if (this.isRelevant(domainElement)) { // improves performance, since type inference need to be done only for relevant elements
            const type = this.services.inference.inferType(domainElement);
            if (isClassType(type)) {
                // register domain elements which have ClassTypes with a key for their uniques
                const key = this.calculateClassKey(type);
                let entries = this.foundDeclarations.get(key);
                if (!entries) {
                    entries = [];
                    this.foundDeclarations.set(key, entries);
                }
                entries.push(domainElement);
            }
        }
        return [];
    }

    /**
     * Calculates a key for a class which encodes its unique properties, i.e. duplicate classes have the same key.
     * This key is used to identify duplicated classes.
     * Override this method to change the properties which make a class unique.
     * @param clas the current class type
     * @returns a string key
     */
    protected calculateClassKey(clas: ClassType): string {
        // usually duplicated classes are critical only for nominal typing, therefore the classname is used as default implementation here
        return `${clas.className}`;
    }

    afterValidation(_domainRoot: unknown, _typir: TypirServices): ValidationProblem[] {
        const result: ValidationProblem[] = [];
        for (const [key, classes] of this.foundDeclarations.entries()) {
            if (classes.length >= 2) {
                for (const clas of classes) {
                    result.push({
                        $problem: ValidationProblem,
                        domainElement: clas,
                        severity: 'error',
                        message: `Declared classes need to be unique (${key}).`,
                    });
                }
            }
        }

        this.foundDeclarations.clear();
        return result;
    }
}

/**
 * Predefined validation to produce errors, if inside a class the same method is declared more than once.
 */
export class UniqueMethodValidation<T> implements ValidationRuleWithBeforeAfter {
    protected readonly foundDeclarations: Map<string, unknown[]> = new Map();
    protected readonly services: TypirServices;
    /** Determines domain elements which represent declared methods, improves performance a lot. */
    protected readonly isMethodDeclaration: (domainElement: unknown) => domainElement is T;
    /** Determines the corresponding domain element of the class declaration, so that Typir can infer its ClassType */
    protected readonly getClassOfMethod: (domainElement: T, methodType: FunctionType) => unknown;

    constructor(services: TypirServices,
        isMethodDeclaration: (domainElement: unknown) => domainElement is T,
        getClassOfMethod: (domainElement: T, methodType: FunctionType) => unknown) {
        this.services = services;
        this.isMethodDeclaration = isMethodDeclaration;
        this.getClassOfMethod = getClassOfMethod;
    }

    beforeValidation(_domainRoot: unknown, _typir: TypirServices): ValidationProblem[] {
        this.foundDeclarations.clear();
        return [];
    }

    validation(domainElement: unknown, _typir: TypirServices): ValidationProblem[] {
        if (this.isMethodDeclaration(domainElement)) { // improves performance, since type inference need to be done only for relevant elements
            const methodType = this.services.inference.inferType(domainElement);
            if (isFunctionType(methodType)) {
                const classDeclaration = this.getClassOfMethod(domainElement, methodType);
                const classType = this.services.inference.inferType(classDeclaration);
                if (isClassType(classType)) {
                    const key = this.calculateMethodKey(classType, methodType);
                    let entries = this.foundDeclarations.get(key);
                    if (!entries) {
                        entries = [];
                        this.foundDeclarations.set(key, entries);
                    }
                    entries.push(domainElement);
                }
            }
        }
        return [];
    }

    /**
     * Calculates a key for a method which encodes its unique properties, i.e. duplicate methods have the same key.
     * Additionally, the class of the method needs to be represented in the key as well.
     * This key is used to identify duplicated methods.
     * Override this method to change the properties which make a method unique.
     * @param clas the current class type
     * @param func the current function type
     * @returns a string key
     */
    protected calculateMethodKey(clas: ClassType, func: FunctionType): string {
        return `${clas.identifier}.${func.functionName}(${func.getInputs().map(param => param.type.identifier)})`;
    }

    afterValidation(_domainRoot: unknown, _typir: TypirServices): ValidationProblem[] {
        const result: ValidationProblem[] = [];
        for (const [key, methods] of this.foundDeclarations.entries()) {
            if (methods.length >= 2) {
                for (const method of methods) {
                    result.push({
                        $problem: ValidationProblem,
                        domainElement: method,
                        severity: 'error',
                        message: `Declared methods need to be unique (${key}).`,
                    });
                }
            }
        }

        this.foundDeclarations.clear();
        return result;
    }
}


// TODO for the review: which name is better? AnyClassType vs TopClassType?
export class AnyClassType extends Type {
    override readonly kind: AnyClassKind;

    constructor(kind: AnyClassKind, identifier: string) {
        super(identifier);
        this.kind = kind;
    }

    override getName(): string {
        return this.identifier;
    }

    override getUserRepresentation(): string {
        return this.identifier;
    }

    override analyzeTypeEqualityProblems(otherType: Type): TypirProblem[] {
        if (isAnyClassType(otherType)) {
            return [];
        } else {
            return [<TypeEqualityProblem>{
                $problem: TypeEqualityProblem,
                type1: this,
                type2: otherType,
                subProblems: [createKindConflict(otherType, this)],
            }];
        }
    }

    override analyzeIsSubTypeOf(superType: Type): TypirProblem[] {
        if (isAnyClassType(superType)) {
            // special case by definition: AnyClassType is sub-type of AnyClassType
            return [];
        } else {
            return [<SubTypeProblem>{
                $problem: SubTypeProblem,
                superType,
                subType: this,
                subProblems: [createKindConflict(superType, this)],
            }];
        }
    }

    override analyzeIsSuperTypeOf(subType: Type): TypirProblem[] {
        // an AnyClassType is the super type of all ClassTypes!
        if (isClassType(subType)) {
            return [];
        } else {
            return [<SubTypeProblem>{
                $problem: SubTypeProblem,
                superType: this,
                subType,
                subProblems: [createKindConflict(this, subType)],
            }];
        }
    }

}

export function isAnyClassType(type: unknown): type is AnyClassType {
    return isType(type) && isAnyClassKind(type.kind);
}


export interface AnyClassTypeDetails {
    inferenceRules?: InferAnyClassType | InferAnyClassType[]
}

export type InferAnyClassType = (domainElement: unknown) => boolean;

export interface AnyClassKindOptions {
    name: string;
}

export const AnyClassKindName = 'AnyClassKind';

export class AnyClassKind implements Kind {
    readonly $name: 'AnyClassKind';
    readonly services: TypirServices;
    readonly options: AnyClassKindOptions;
    protected instance: AnyClassType | undefined;

    constructor(services: TypirServices, options?: Partial<AnyClassKindOptions>) {
        this.$name = AnyClassKindName;
        this.services = services;
        this.services.kinds.register(this);
        this.options = {
            // the default values:
            name: 'AnyClass',
            // the actually overriden values:
            ...options
        };
    }

    getAnyClassType(typeDetails: AnyClassTypeDetails): AnyClassType | undefined {
        const key = this.calculateIdentifier(typeDetails);
        return this.services.graph.getType(key) as AnyClassType;
    }

    getOrCreateAnyClassType(typeDetails: AnyClassTypeDetails): AnyClassType {
        const topType = this.getAnyClassType(typeDetails);
        if (topType) {
            this.registerInferenceRules(typeDetails, topType);
            return topType;
        }
        return this.createAnyClassType(typeDetails);
    }

    createAnyClassType(typeDetails: AnyClassTypeDetails): AnyClassType {
        assertTrue(this.getAnyClassType(typeDetails) === undefined);

        // create the top type (singleton)
        if (this.instance) {
            // note, that the given inference rules are ignored in this case!
            return this.instance;
        }
        const topType = new AnyClassType(this, this.calculateIdentifier(typeDetails));
        this.instance = topType;
        this.services.graph.addNode(topType);

        this.registerInferenceRules(typeDetails, topType);

        return topType;
    }

    /** Register all inference rules for primitives within a single generic inference rule (in order to keep the number of "global" inference rules small). */
    protected registerInferenceRules(typeDetails: AnyClassTypeDetails, topType: AnyClassType) {
        const rules = toArray(typeDetails.inferenceRules);
        if (rules.length >= 1) {
            this.services.inference.addInferenceRule((domainElement, _typir) => {
                for (const inferenceRule of rules) {
                    if (inferenceRule(domainElement)) {
                        return topType;
                    }
                }
                return InferenceRuleNotApplicable;
            }, topType);
        }
    }

    calculateIdentifier(_typeDetails: AnyClassTypeDetails): string {
        return this.options.name;
    }

}

export function isAnyClassKind(kind: unknown): kind is AnyClassKind {
    return isKind(kind) && kind.$name === AnyClassKindName;
}
