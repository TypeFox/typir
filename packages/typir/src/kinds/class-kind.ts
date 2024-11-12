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
import { Type, TypeStateListener, isType } from '../graph/type-node.js';
import { TypirServices } from '../typir.js';
import { TypeReference, TypeSelector, TypirProblem, resolveTypeSelector } from '../utils/utils-definitions.js';
import { IndexedTypeConflict, MapListConverter, TypeCheckStrategy, checkNameTypesMap, checkValueForConflict, createKindConflict, createTypeCheckStrategy } from '../utils/utils-type-comparison.js';
import { assertTrue, assertType, toArray } from '../utils/utils.js';
import { CreateFunctionTypeDetails, FunctionKind, FunctionKindName, FunctionType, isFunctionKind, isFunctionType } from './function-kind.js';
import { Kind, isKind } from './kind.js';
import { TypeInitializer } from '../utils/type-initialization.js';

// TODO irgendwann die Dateien auseinander ziehen und Packages einführen!

// TODO wenn die Initialisierung von ClassType abgeschlossen ist, sollte darüber aktiv benachrichtigt werden!
export class ClassType extends Type {
    override readonly kind: ClassKind;
    readonly className: string;
    /** The super classes are readonly, since they might be used to calculate the identifier of the current class, which must be stable. */
    protected superClasses: Array<TypeReference<ClassType>>; // if necessary, the array could be replaced by Map<string, ClassType>: name/form -> ClassType, for faster look-ups
    protected readonly subClasses: ClassType[] = []; // additional sub classes might be added later on!
    protected readonly fields: Map<string, FieldDetails> = new Map(); // unordered
    protected methods: MethodDetails[]; // unordered

    constructor(kind: ClassKind, typeDetails: ClassTypeDetails) {
        super(undefined);
        this.kind = kind;
        this.className = typeDetails.className;

        // resolve the super classes
        this.superClasses = toArray(typeDetails.superClasses).map(superr => {
            const superRef = new TypeReference<ClassType>(superr, kind.services);
            superRef.addReactionOnTypeCompleted((_ref, superType) => {
                // after the super-class is complete, register this class as sub-class for that super-class
                superType.subClasses.push(this);
            }, true);
            superRef.addReactionOnTypeUnresolved((_ref, superType) => {
                // if the superType gets invalid, de-register this class as sub-class of the super-class
                superType.subClasses.splice(superType.subClasses.indexOf(this), 1);
            }, true);
            return superRef;
        });

        // resolve fields
        typeDetails.fields
            .map(field => <FieldDetails>{
                name: field.name,
                type: new TypeReference(field.type, kind.services),
            })
            .forEach(field => {
                if (this.fields.has(field.name)) {
                    // check collisions of field names
                    throw new Error(`The field name '${field.name}' is not unique for class '${this.className}'.`);
                } else {
                    this.fields.set(field.name, field);
                }
            });
        const refFields: TypeReference[] = [];
        [...this.fields.values()].forEach(f => refFields.push(f.type));

        // resolve methods
        this.methods = typeDetails.methods.map(method => <MethodDetails>{
            type: new TypeReference(kind.getMethodKind().createFunctionType(method), kind.services),
        });
        const refMethods = this.methods.map(m => m.type);
        // the uniqueness of methods can be checked with the predefined UniqueMethodValidation below

        // calculate the Identifier, based on the resolved type references
        // const all: Array<TypeReference<Type | FunctionType>> = [];
        const all: Array<TypeReference<Type>> = [];
        all.push(...refFields);
        all.push(...(refMethods as unknown as Array<TypeReference<Type>>)); // TODO dirty hack?!
        // all.push(...refMethods); // does not work

        this.completeInitialization({
            preconditionsForInitialization: {
                refsToBeIdentified: all,
            },
            preconditionsForCompletion: {
                refsToBeCompleted: this.superClasses as unknown as Array<TypeReference<Type>>,
            },
            onIdentification: () => {
                this.identifier = this.kind.calculateIdentifier(typeDetails);
                // TODO identifier erst hier berechnen?! registering??
            },
            onCompletion: () => {
                // when all super classes are completely available, do the following checks:
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
            },
            onInvalidation: () => {
                // TODO remove all listeners, ...
            },
        });
    }

    override getName(): string {
        return `${this.className}`;
    }

    override getUserRepresentation(): string {
        const slots: string[] = [];
        // fields
        const fields: string[] = [];
        for (const field of this.getFields(false).entries()) {
            fields.push(`${field[0]}: ${field[1].getName()}`);
        }
        if (fields.length >= 1) {
            slots.push(fields.join(', '));
        }
        // methods
        const methods: string[] = [];
        for (const method of this.getMethods(false)) {
            methods.push(`${method.getUserRepresentation()}`);
        }
        if (methods.length >= 1) {
            slots.push(methods.join(', '));
        }
        // super classes
        const superClasses = this.getDeclaredSuperClasses();
        const extendedClasses = superClasses.length <= 0 ? '' : ` extends ${superClasses.map(c => c.getName()).join(', ')}`;
        // complete representation
        return `${this.className}${extendedClasses} { ${slots.join(', ')} }`;
    }

    override analyzeTypeEqualityProblems(otherType: Type): TypirProblem[] {
        if (isClassType(otherType)) {
            if (this.kind.options.typing === 'Structural') {
                // for structural typing:
                return checkNameTypesMap(this.getFields(true), otherType.getFields(true), // including fields of super-classes
                    (t1, t2) => this.kind.services.equality.getTypeEqualityProblem(t1, t2));
            } else if (this.kind.options.typing === 'Nominal') {
                // for nominal typing:
                return checkValueForConflict(this.getIdentifier(), otherType.getIdentifier(), 'name');
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

    getDeclaredSuperClasses(): ClassType[] {
        return this.superClasses.map(superr => {
            const superType = superr.getType();
            if (superType) {
                return superType;
            } else {
                throw new Error('Not all super class types are resolved.');
            }
        });
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
        this.fields.forEach(fieldDetails => {
            const field = fieldDetails.type.getType();
            if (field) {
                result.set(fieldDetails.name, field);
            } else {
                throw new Error('Not all fields are resolved.');
            }
        });
        return result;
    }

    getMethods(withSuperClassMethods: boolean): FunctionType[] {
        // own methods
        const result = this.methods.map(m => {
            const method = m.type.getType();
            if (method) {
                return method;
            } else {
                throw new Error('Not all methods are resolved.');
            }
        });
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
    type: TypeReference<Type>;
}
export interface CreateFieldDetails {
    name: string;
    type: TypeSelector;
}

export interface MethodDetails {
    type: TypeReference<FunctionType>;
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
    readonly options: Readonly<ClassKindOptions>;

    constructor(services: TypirServices, options?: Partial<ClassKindOptions>) {
        this.$name = ClassKindName;
        this.services = services;
        this.services.kinds.register(this);
        this.options = { // TODO in eigene Methode auslagern!
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

    // zwei verschiedene Use cases für Calls: Reference/use (e.g. Var-Type) VS Creation (e.g. Class-Declaration)

    /**
     * For the use case, that a type is used/referenced, e.g. to specify the type of a variable declaration.
     * @param typeDetails all information needed to identify the class
     * @returns a reference to the class type, which might be resolved in the future, if the class type does not yet exist
     */
    getClassType<T>(typeDetails: ClassTypeDetails<T> | string): TypeReference<ClassType> { // string for nominal typing
        if (typeof typeDetails === 'string') {
            // nominal typing
            return new TypeReference(typeDetails, this.services);
        } else {
            // structural typing
            // TODO does this case occur in practise?
            return new TypeReference(() => this.calculateIdentifier(typeDetails), this.services);
        }
    }

    /**
     * For the use case, that a new type needs to be created in Typir, e.g. for a class declaration.
     * This function ensures, that the same type is created only once, even if this function is called multiple times, if e.g. the same type might be created for different type declaration.
     * Nevertheless, usually a validation should produce an error in this case.
     * @param typeDetails all information needed to create a new class
     * @returns an initializer which creates and returns the new class type, when all depending types are resolved
     */
    createClassType<T, T1, T2>(typeDetails: CreateClassTypeDetails<T, T1, T2>): TypeInitializer<ClassType> {
        // assertTrue(this.getClassType(typeDetails) === undefined, `The class '${typeDetails.className}' already exists!`); // ensures, that no duplicated classes are created!

        return new ClassTypeInitializer(this.services, this, typeDetails);
    }

    getIdentifierPrefix(): string {
        return this.options.identifierPrefix ? this.options.identifierPrefix + '-' : '';
    }

    /**
     * TODO
     *
     * Design decisions:
     * - This method is part of the ClassKind and not part of ClassType, since the ClassKind requires it for 'getClassType'!
     * - The kind might use/add additional prefixes for the identifiers to make them "even more unique".
     *
     * @param typeDetails the details
     * @returns the new identifier
     */
    calculateIdentifier<T>(typeDetails: ClassTypeDetails<T>): string { // TODO kann keinen Identifier liefern, wenn noch nicht resolved!
        // purpose of identifier: distinguish different types; NOT: not uniquely overloaded types
        const prefix = this.getIdentifierPrefix();
        if (this.options.typing === 'Structural') {
            // fields
            const fields: string = typeDetails.fields
                .map(f => `${f.name}:${resolveTypeSelector(this.services, f.type)}`) // the names and the types of the fields are relevant, since different field types lead to different class types!
                .sort() // the order of fields does not matter, therefore we need a stable order to make the identifiers comparable
                .join(',');
            // methods
            const functionKind = this.getMethodKind();
            const methods: string = typeDetails.methods
                .map(method => {
                    functionKind.getOrCreateFunctionType(method); // ensure, that the corresponding Type is existing in the type system
                    return functionKind.calculateIdentifier(method); // reuse the Identifier for Functions here!
                })
                .sort() // the order of methods does not matter, therefore we need a stable order to make the identifiers comparable
                .join(',');
            // super classes (TODO oder strukturell per getAllSuperClassX lösen?!)
            const superClasses: string = toArray(typeDetails.superClasses)
                .map(selector => {
                    const type = resolveTypeSelector(this.services, selector);
                    assertType(type, isClassType);
                    return type.getIdentifier();
                })
                .sort()
                .join(',');
            // complete identifier (the name of the class does not matter for structural typing!)
            return `${prefix}fields{${fields}}-methods{${methods}}-extends{${superClasses}}`;
        } else if (this.options.typing === 'Nominal') {
            // only the name matters for nominal typing!
            return `${prefix}${typeDetails.className}`;
        } else {
            assertUnreachable(this.options.typing);
        }
    }

    getMethodKind(): FunctionKind {
        // ensure, that Typir uses the predefined 'function' kind for methods
        const kind = this.services.kinds.get(FunctionKindName);
        return isFunctionKind(kind) ? kind : new FunctionKind(this.services);
    }

    getOrCreateTopClassType(typeDetails: TopClassTypeDetails): TopClassType {
        return this.getTopClassKind().getOrCreateTopClassType(typeDetails);
    }

    getTopClassKind(): TopClassKind {
        // ensure, that Typir uses the predefined 'TopClass' kind
        const kind = this.services.kinds.get(TopClassKindName);
        return isTopClassKind(kind) ? kind : new TopClassKind(this.services);
    }

}

export function isClassKind(kind: unknown): kind is ClassKind {
    return isKind(kind) && kind.$name === ClassKindName;
}


export class ClassTypeInitializer<T = unknown, T1 = unknown, T2 = unknown> extends TypeInitializer<ClassType> implements TypeStateListener {
    protected readonly typeDetails: CreateClassTypeDetails<T, T1, T2>;
    protected readonly kind: ClassKind;

    constructor(services: TypirServices, kind: ClassKind, typeDetails: CreateClassTypeDetails<T, T1, T2>) {
        super(services);
        this.typeDetails = typeDetails;
        this.kind = kind;

        // create the class type
        const classType = new ClassType(kind, typeDetails as CreateClassTypeDetails);
        if (kind.options.typing === 'Structural') {
            // TODO Vorsicht Inference rules werden by default an den Identifier gebunden (ebenso Validations)!
            this.services.graph.addNode(classType, kind.getIdentifierPrefix() + typeDetails.className);
            // TODO hinterher wieder abmelden, wenn Type invalid geworden ist bzw. ein anderer Type gewonnen hat? bzw. gewinnt immer der erste Type?
        }

        classType.addListener(this, true); // trigger directly, if some initialization states are already reached!
    }

    switchedToIdentifiable(type: Type): void {
        // TODO Vorsicht, dass hier nicht 2x derselbe Type angefangen wird zu erstellen und dann zwei Typen auf ihre Vervollständigung warten!
        // 2x TypeResolver erstellen, beide müssen später denselben ClassType zurückliefern!
        // bei Node { children: Node[] } muss der Zyklus erkannt und behandelt werden!!
        this.producedType(type as ClassType);
    }

    switchedToCompleted(classType: Type): void {
        // register inference rules
        // TODO or can this be done already after having the identifier?
        registerInferenceRules<T, T1, T2>(this.services, this.typeDetails, this.kind, classType as ClassType);
        classType.removeListener(this); // the work of this initializer is done now
    }

    switchedToInvalid(_type: Type): void {
        // do nothing
    }
}


function registerInferenceRules<T, T1, T2>(services: TypirServices, typeDetails: CreateClassTypeDetails<T, T1, T2>, classKind: ClassKind, classType: ClassType) {
    if (typeDetails.inferenceRuleForDeclaration) {
        services.inference.addInferenceRule({
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
        registerInferenceRuleForLiteral(services, typeDetails.inferenceRuleForLiteral, classKind, classType);
    }
    if (typeDetails.inferenceRuleForReference) {
        registerInferenceRuleForLiteral(services, typeDetails.inferenceRuleForReference, classKind, classType);
    }
    if (typeDetails.inferenceRuleForFieldAccess) {
        services.inference.addInferenceRule((domainElement, _typir) => {
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

function registerInferenceRuleForLiteral<T>(services: TypirServices, rule: InferClassLiteral<T>, classKind: ClassKind, classType: ClassType): void {
    const mapListConverter = new MapListConverter();
    services.inference.addInferenceRule({
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
        return `${clas.getIdentifier()}.${func.functionName}(${func.getInputs().map(param => param.type.getIdentifier())})`;
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


export class TopClassType extends Type {
    override readonly kind: TopClassKind;

    constructor(kind: TopClassKind, identifier: string) {
        super(identifier);
        this.kind = kind;
    }

    override getName(): string {
        return this.getIdentifier();
    }

    override getUserRepresentation(): string {
        return this.getIdentifier();
    }

    override analyzeTypeEqualityProblems(otherType: Type): TypirProblem[] {
        if (isTopClassType(otherType)) {
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
        if (isTopClassType(superType)) {
            // special case by definition: TopClassType is sub-type of TopClassType
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
        // an TopClassType is the super type of all ClassTypes!
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

export function isTopClassType(type: unknown): type is TopClassType {
    return isType(type) && isTopClassKind(type.kind);
}


export interface TopClassTypeDetails {
    inferenceRules?: InferTopClassType | InferTopClassType[]
}

export type InferTopClassType = (domainElement: unknown) => boolean;

export interface TopClassKindOptions {
    name: string;
}

export const TopClassKindName = 'TopClassKind';

export class TopClassKind implements Kind {
    readonly $name: 'TopClassKind';
    readonly services: TypirServices;
    readonly options: TopClassKindOptions;
    protected instance: TopClassType | undefined;

    constructor(services: TypirServices, options?: Partial<TopClassKindOptions>) {
        this.$name = TopClassKindName;
        this.services = services;
        this.services.kinds.register(this);
        this.options = {
            // the default values:
            name: 'TopClass',
            // the actually overriden values:
            ...options
        };
    }

    getTopClassType(typeDetails: TopClassTypeDetails): TopClassType | undefined {
        const key = this.calculateIdentifier(typeDetails);
        return this.services.graph.getType(key) as TopClassType;
    }

    getOrCreateTopClassType(typeDetails: TopClassTypeDetails): TopClassType {
        const topType = this.getTopClassType(typeDetails);
        if (topType) {
            this.registerInferenceRules(typeDetails, topType);
            return topType;
        }
        return this.createTopClassType(typeDetails);
    }

    createTopClassType(typeDetails: TopClassTypeDetails): TopClassType {
        assertTrue(this.getTopClassType(typeDetails) === undefined);

        // create the top type (singleton)
        if (this.instance) {
            // note, that the given inference rules are ignored in this case!
            return this.instance;
        }
        const topType = new TopClassType(this, this.calculateIdentifier(typeDetails));
        this.instance = topType;
        this.services.graph.addNode(topType);

        this.registerInferenceRules(typeDetails, topType);

        return topType;
    }

    /** Register all inference rules for primitives within a single generic inference rule (in order to keep the number of "global" inference rules small). */
    protected registerInferenceRules(typeDetails: TopClassTypeDetails, topType: TopClassType) {
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

    calculateIdentifier(_typeDetails: TopClassTypeDetails): string {
        return this.options.name;
    }

}

export function isTopClassKind(kind: unknown): kind is TopClassKind {
    return isKind(kind) && kind.$name === TopClassKindName;
}
