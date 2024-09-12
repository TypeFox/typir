/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { assertUnreachable } from 'langium';
import { TypeEqualityProblem } from '../features/equality.js';
import { InferenceProblem, InferenceRuleNotApplicable } from '../features/inference.js';
import { SubTypeProblem } from '../features/subtype.js';
import { Type, isType } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { TypeSelector, TypirProblem, resolveTypeSelector } from '../utils/utils-definitions.js';
import { IndexedTypeConflict, MapListConverter, TypeCheckStrategy, checkNameTypesMap, checkValueForConflict, createKindConflict, createTypeCheckStrategy } from '../utils/utils-type-comparison.js';
import { assertTrue, assertType, toArray } from '../utils/utils.js';
import { Kind, isKind } from './kind.js';

export class ClassType extends Type {
    override readonly kind: ClassKind;
    readonly className: string;
    readonly superClasses: ClassType[];
    readonly subClasses: ClassType[] = [];
    readonly fields: FieldDetails[];

    constructor(kind: ClassKind, identifier: string, typeDetails: ClassTypeDetails) {
        super(identifier);
        this.kind = kind;
        this.className = typeDetails.className;

        // resolve the super classes
        this.superClasses = toArray(typeDetails.superClasses).map(superr => {
            const cls = resolveTypeSelector(this.kind.typir, superr);
            assertType(cls, isClassType);
            return cls;
        });
        // register this class as sub-class for all super-classes
        this.superClasses.forEach(superr => superr.subClasses.push(this));
        // check number of allowed super classes
        if (this.kind.options.maximumNumberOfSuperClasses >= 0) {
            if (this.kind.options.maximumNumberOfSuperClasses < this.superClasses.length) {
                throw new Error(`Only ${this.kind.options.maximumNumberOfSuperClasses} super-classes are allowed.`);
            }
        }
        // check for cycles in sub-type-relationships
        for (const superClass of this.superClasses) {
            if (superClass.getAllSuperClasses(true).has(this)) {
                throw new Error('Circle in super-sub-class-relationships are not allowed.');
            }
        }

        // fields
        this.fields = typeDetails.fields.map(field => <FieldDetails>{
            name: field.name,
            type: resolveTypeSelector(this.kind.typir, field.type),
        });
        // check collisions of field names
        if (this.getFields(false).size !== typeDetails.fields.length) {
            throw new Error('field names must be unique!');
        }
    }

    override getUserRepresentation(): string {
        // fields
        const fields: string[] = [];
        for (const field of this.getFields(false).entries()) {
            fields.push(`${field[0]}: ${field[1].getUserRepresentation()}`); // TODO short vs long representation!! name vs identifier!
        }
        // super classes
        const superClasses = this.getDeclaredSuperClasses();
        const extendedClasses = superClasses.length <= 0 ? '' : ` extends ${superClasses.map(c => c.getUserRepresentation()).join(', ')}`;
        // whole representation
        return `${this.className} { ${fields.join(', ')} }${extendedClasses}`;
    }

    override analyzeTypeEqualityProblems(otherType: Type): TypirProblem[] {
        if (isClassType(otherType)) {
            if (this.kind.options.typing === 'Structural') {
                // for structural typing:
                return checkNameTypesMap(this.getFields(true), otherType.getFields(true), // including fields of super-classes
                    (t1, t2) => this.kind.typir.equality.getTypeEqualityProblem(t1, t2));
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
                    const checkStrategy = createTypeCheckStrategy(this.kind.options.subtypeFieldChecking, this.kind.typir);
                    const subTypeComparison = checkStrategy(subFieldType, superFieldType);
                    if (subTypeComparison !== undefined) {
                        conflicts.push({
                            $problem: IndexedTypeConflict,
                            expected: superType,
                            actual: subType,
                            index: superFieldName,
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
                        index: superFieldName,
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
                const localResult = checkValueForConflict(superType.identifier, oneSub.identifier, 'name'); // TODO use equals instead??
                if (localResult.length <= 0) {
                    return []; // class is found in the class hierarchy
                }
                globalResult.push(...localResult); // return all conflicts, TODO: is that too much??
            }
            return globalResult;
        } else {
            assertUnreachable(this.kind.options.typing);
        }
    }

    getDeclaredSuperClasses(): ClassType[] {
        return this.superClasses;
    }

    getDeclaredSubClasses(): ClassType[] {
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

export interface ClassTypeDetails {
    className: string,
    superClasses?: TypeSelector | TypeSelector[],
    fields: CreateFieldDetails[],
    // TODO methods
}
export interface CreateClassTypeDetails<T1 = unknown, T2 = unknown> extends ClassTypeDetails { // TODO the generics look very bad!
    inferenceRuleForDeclaration?: (domainElement: unknown) => boolean, // TODO what is the purpose for this? what is the difference to literals?
    inferenceRuleForLiteral?: InferClassLiteral<T1>, // InferClassLiteral<T> | Array<InferClassLiteral<T>>, does not work: https://stackoverflow.com/questions/65129070/defining-an-array-of-differing-generic-types-in-typescript
    inferenceRuleForReference?: InferClassLiteral<T2>,
    inferenceRuleForFieldAccess?: (domainElement: unknown) => string | unknown | InferenceRuleNotApplicable, // name of the field | element to infer the type of the field (e.g. the type) | rule not applicable
    // TODO inference rule for method calls
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
    readonly typir: Typir;
    readonly options: ClassKindOptions;

    constructor(typir: Typir, options?: Partial<ClassKindOptions>) {
        this.$name = ClassKindName;
        this.typir = typir;
        this.typir.registerKind(this);
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

    getClassType(typeDetails: ClassTypeDetails | string): ClassType | undefined { // string for nominal typing
        const key = this.calculateIdentifier(typeof typeDetails === 'string' ? { className: typeDetails, fields: []} : typeDetails);
        return this.typir.graph.getType(key) as ClassType;
    }

    getOrCreateClassType<T1, T2>(typeDetails: CreateClassTypeDetails<T1, T2>): ClassType {
        const result = this.getClassType(typeDetails);
        if (result) {
            return result;
        }
        return this.createClassType(typeDetails);
    }

    createClassType<T1, T2>(typeDetails: CreateClassTypeDetails<T1, T2>): ClassType {
        // create the class type
        const classType = new ClassType(this, this.calculateIdentifier(typeDetails), typeDetails);
        this.typir.graph.addNode(classType);

        // register inference rules
        if (typeDetails.inferenceRuleForDeclaration) {
            this.typir.inference.addInferenceRule({
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
            });
        }
        if (typeDetails.inferenceRuleForLiteral) {
            this.registerInferenceRule(typeDetails.inferenceRuleForLiteral, this, classType);
        }
        if (typeDetails.inferenceRuleForReference) {
            this.registerInferenceRule(typeDetails.inferenceRuleForReference, this, classType);
        }
        if (typeDetails.inferenceRuleForFieldAccess) {
            this.typir.inference.addInferenceRule((domainElement, _typir) => {
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
            });
        }

        return classType;
    }

    protected registerInferenceRule<T>(rule: InferClassLiteral<T>, classKind: ClassKind, classType: ClassType): void {
        const mapListConverter = new MapListConverter();
        this.typir.inference.addInferenceRule({
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
        });
    }

    calculateIdentifier(typeDetails: ClassTypeDetails): string {
        return this.printClassType(typeDetails);
    }

    protected printClassType(typeDetails: ClassTypeDetails): string {
        const prefix = this.options.identifierPrefix;
        if (this.options.typing === 'Structural') {
            // fields
            const fields: string[] = [];
            for (const [fieldNUmber, fieldDetails] of typeDetails.fields.entries()) {
                fields.push(`${fieldNUmber}:${fieldDetails.name}`);
            }
            // super classes
            const superClasses = toArray(typeDetails.superClasses).map(selector => {
                const type = resolveTypeSelector(this.typir, selector);
                assertType(type, isClassType);
                return type;
            });
            const extendedClasses = superClasses.length <= 0 ? '' : `-extends-${superClasses.map(c => c.identifier).join(',')}`;
            // whole representation
            return `${prefix}-${typeDetails.className}{${fields.join(',')}}${extendedClasses}`;
        } else if (this.options.typing === 'Nominal') {
            return `${prefix}-${typeDetails.className}`;
        } else {
            assertUnreachable(this.options.typing);
        }
    }

}

export function isClassKind(kind: unknown): kind is ClassKind {
    return isKind(kind) && kind.$name === ClassKindName;
}
