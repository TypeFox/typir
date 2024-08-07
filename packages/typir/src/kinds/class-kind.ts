/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { assertUnreachable } from 'langium';
import { InferenceProblem, InferenceRuleNotApplicable } from '../features/inference.js';
import { SubTypeProblem } from '../features/subtype.js';
import { TypeEdge } from '../graph/type-edge.js';
import { Type } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { IndexedTypeConflict, MapListConverter, TypeCheckStrategy, checkNameTypesMap, checkValueForConflict, createTypeCheckStrategy } from '../utils/utils-type-comparison.js';
import { assertKind, assertTrue, toArray } from '../utils/utils.js';
import { Kind, isKind } from './kind.js';
import { resolveTypeSelector, TypeSelector, TypirProblem } from '../utils/utils-definitions.js';

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
    type: TypeSelector;
}

export interface ClassTypeDetails<T1 = unknown, T2 = unknown> { // TODO the generics look very bad!
    className: string,
    superClasses?: TypeSelector | TypeSelector[],
    fields: FieldDetails[],
    // TODO methods
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
        this.$name = 'ClassKind';
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

    getClassType<T1, T2>(typeDetails: ClassTypeDetails<T1, T2> | string): Type | undefined { // string for nominal typing
        const key = this.printClassType(typeof typeDetails === 'string' ? { className: typeDetails, fields: []} : typeDetails);
        return this.typir.graph.getType(key);
    }

    getOrCreateClassType<T1, T2>(typeDetails: ClassTypeDetails<T1, T2>): Type {
        const result = this.getClassType(typeDetails);
        if (result) {
            return result;
        }
        return this.createClassType(typeDetails);
    }

    createClassType<T1, T2>(typeDetails: ClassTypeDetails<T1, T2>): Type {
        const theSuperClasses = toArray(typeDetails.superClasses);
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const classKind = this;

        // create the class type
        const classType = new Type(this, this.printClassType(typeDetails));
        this.typir.graph.addNode(classType);

        // FIELDS
        // link it to all its "field types"
        for (const fieldInfos of typeDetails.fields) {
            // new edge between class and field with "semantics key"
            const fieldType = resolveTypeSelector(this.typir, fieldInfos.type);
            const edge = new TypeEdge(classType, fieldType, FIELD_TYPE);
            // store the name of the field within the edge
            edge.properties.set(FIELD_NAME, fieldInfos.name);
            this.typir.graph.addEdge(edge);
        }
        // check collisions of field names
        if (this.getFields(classType, false).size !== typeDetails.fields.length) {
            throw new Error('field names must be unique!');
        }

        // SUB-SUPER-CLASSES
        // check number of allowed super classes
        if (this.options.maximumNumberOfSuperClasses >= 0) {
            if (this.options.maximumNumberOfSuperClasses < theSuperClasses.length) {
                throw new Error(`Only ${this.options.maximumNumberOfSuperClasses} super-classes are allowed.`);
            }
        }
        // check cycles
        for (const superDetails of theSuperClasses) {
            const superClass = resolveTypeSelector(this.typir, superDetails);
            if (this.getAllSuperClasses(superClass, true).has(classType)) {
                throw new Error('Circle in super-sub-class-relationships are not allowed.');
            }
        }
        // link the new class to all its super classes
        for (const superDetails of theSuperClasses) {
            const superClass = resolveTypeSelector(this.typir, superDetails);
            if (superClass.kind.$name !== classType.kind.$name) {
                throw new Error();
            }
            const edge = new TypeEdge(classType, superClass, SUPER_CLASS);
            this.typir.graph.addEdge(edge);
        }

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
            this.registerInferenceRule(typeDetails.inferenceRuleForLiteral, classKind, classType);
        }
        if (typeDetails.inferenceRuleForReference) {
            this.registerInferenceRule(typeDetails.inferenceRuleForReference, classKind, classType);
        }
        if (typeDetails.inferenceRuleForFieldAccess) {
            this.typir.inference.addInferenceRule((domainElement, _typir) => {
                const result = typeDetails.inferenceRuleForFieldAccess!(domainElement);
                if (result === InferenceRuleNotApplicable) {
                    return InferenceRuleNotApplicable;
                } else if (typeof result === 'string') {
                    // get the type of the given field name
                    const fieldType = classKind.getFields(classType, true).get(result);
                    if (fieldType) {
                        return fieldType;
                    }
                    return <InferenceProblem>{
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

    protected registerInferenceRule<T>(rule: InferClassLiteral<T>, classKind: ClassKind, classType: Type): void {
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
                const allExpectedFields = classKind.getFields(classType, true);
                // this class type might match, to be sure, resolve the types of the values for the parameters and continue to step 2
                const checkedFieldsProblems = checkNameTypesMap(
                    mapListConverter.toMap(childrenTypes),
                    allExpectedFields,
                    createTypeCheckStrategy(classKind.options.subtypeFieldChecking, typir)
                );
                if (checkedFieldsProblems.length >= 1) {
                    // (only) for overloaded functions, the types of the parameters need to be inferred in order to determine an exact match
                    return <InferenceProblem>{
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

    protected printClassType<T1, T2>(typeDetails: ClassTypeDetails<T1, T2>): string {
        const prefix = this.options.identifierPrefix;
        if (this.options.typing === 'Structural') {
            // fields
            const fields: string[] = [];
            for (const [fieldNUmber, fieldDetails] of typeDetails.fields.entries()) {
                fields.push(`${fieldNUmber}:${fieldDetails.name}`);
            }
            // super classes
            const superClasses = toArray(typeDetails.superClasses).map(selector => resolveTypeSelector(this.typir, selector));
            const extendedClasses = superClasses.length <= 0 ? '' : `-extends-${superClasses.map(c => c.name).join(',')}`;
            // whole representation
            return `${prefix}-${typeDetails.className}{${fields.join(',')}}${extendedClasses}`;
        } else if (this.options.typing === 'Nominal') {
            return `${prefix}-${typeDetails.className}`;
        } else {
            assertUnreachable(this.options.typing);
        }
    }

    getUserRepresentation(type: Type): string {
        assertKind(type.kind, isClassKind);
        // fields
        const fields: string[] = [];
        for (const field of this.getFields(type, false).entries()) {
            fields.push(`${field[0]}: ${field[1].name}`);
        }
        // super classes
        const superClasses = this.getDeclaredSuperClasses(type);
        const extendedClasses = superClasses.length <= 0 ? '' : ` extends ${superClasses.map(c => c.name).join(', ')}`;
        // whole representation
        return `${type.name} { ${fields.join(', ')} }${extendedClasses}`;
    }

    analyzeSubTypeProblems(subType: Type, superType: Type): TypirProblem[] {
        if (isClassKind(superType.kind) && isClassKind(subType.kind)) {
            if (this.options.typing === 'Structural') {
                // for structural typing, the sub type needs to have all fields of the super type with assignable types (including fields of all super classes):
                const conflicts: IndexedTypeConflict[] = [];
                const subFields = subType.kind.getFields(subType, true);
                for (const [superFieldName, superFieldType] of superType.kind.getFields(superType, true)) {
                    if (subFields.has(superFieldName)) {
                        // field is both in super and sub
                        const subFieldType = subFields.get(superFieldName)!;
                        const checkStrategy = createTypeCheckStrategy(this.options.subtypeFieldChecking, this.typir);
                        const subTypeComparison = checkStrategy(subFieldType, superFieldType);
                        if (subTypeComparison !== undefined) {
                            conflicts.push({
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
                            expected: superFieldType,
                            actual: undefined,
                            index: superFieldName,
                            subProblems: []
                        });
                    }
                }
                // Note that it is not necessary to check, whether the sub class has additional fields than the super type!
                return conflicts;
            } else if (this.options.typing === 'Nominal') {
                // for nominal typing (takes super classes into account)
                const allSub = this.getAllSuperClasses(subType, true);
                const globalResult: TypirProblem[] = [];
                for (const oneSub of allSub) {
                    const localResult = checkValueForConflict(superType.name, oneSub.name, 'name');
                    if (localResult.length <= 0) {
                        return []; // class is found in the class hierarchy
                    }
                    globalResult.push(...localResult); // return all conflicts
                }
                return globalResult;
            } else {
                assertUnreachable(this.options.typing);
            }
        }
        return [<SubTypeProblem>{
            superType,
            subType,
            subProblems: checkValueForConflict(superType.kind.$name, subType.kind.$name, 'kind'),
        }];
    }

    analyzeTypeEqualityProblems(type1: Type, type2: Type): TypirProblem[] {
        if (isClassKind(type1.kind) && isClassKind(type2.kind)) {
            if (this.options.typing === 'Structural') {
                // for structural typing:
                return checkNameTypesMap(type1.kind.getFields(type1, true), type2.kind.getFields(type2, true),
                    (t1, t2) => this.typir.equality.getTypeEqualityProblem(t1, t2));
            } else if (this.options.typing === 'Nominal') {
                // for nominal typing:
                return checkValueForConflict(type1.name, type2.name, 'name');
            } else {
                assertUnreachable(this.options.typing);
            }
        }
        throw new Error();
    }

    getDeclaredSuperClasses(classType: Type): Type[] {
        assertKind(classType.kind, isClassKind);
        return classType.getOutgoingEdges(SUPER_CLASS).map(edge => edge.to);
    }

    getDeclaredSubClasses(classType: Type): Type[] {
        assertKind(classType.kind, isClassKind);
        return classType.getIncomingEdges(SUPER_CLASS).map(edge => edge.from);
    }

    getAllSuperClasses(classType: Type, includingGivenClass: boolean = false): Set<Type> {
        assertKind(classType.kind, isClassKind);
        const result = new Set<Type>();
        if (includingGivenClass) {
            result.add(classType);
        }
        const toadd = this.getDeclaredSuperClasses(classType);
        while (toadd.length >= 1) {
            const current = toadd.pop()!;
            if (result.has(current)) {
                // nothing to do
            } else {
                // found a new super class
                result.add(current);
                // ... and add its super classes as well
                toadd.push(...this.getDeclaredSuperClasses(current));
            }
        }
        return result;
        // Sets preserve insertion order:
        // return Array.from(set);
    }

    getAllSubClasses(classType: Type, includingGivenClass: boolean = false): Set<Type> {
        assertKind(classType.kind, isClassKind);
        const result = new Set<Type>();
        if (includingGivenClass) {
            result.add(classType);
        }
        const toadd = this.getDeclaredSubClasses(classType);
        while (toadd.length >= 1) {
            const current = toadd.pop()!;
            if (result.has(current)) {
                // nothing to do
            } else {
                // found a new sub class
                result.add(current);
                // ... and add its sub classes as well
                toadd.push(...this.getDeclaredSubClasses(current));
            }
        }
        return result;
    }

    getFields(classType: Type, withSuperClassesFields: boolean): Map<string, Type> {
        assertKind(classType.kind, isClassKind);
        // in case of conflicting field names, the type of the sub-class takes precedence! TODO
        const result = new Map();
        // fields of super classes
        if (withSuperClassesFields) {
            for (const superClass of this.getDeclaredSuperClasses(classType)) {
                for (const [superName, superType] of this.getFields(superClass, true)) {
                    result.set(superName, superType);
                }
            }
        }
        // own fields
        classType.getOutgoingEdges(FIELD_TYPE).forEach(edge => {
            const name = edge.properties.get(FIELD_NAME);
            const type = edge.to;
            result.set(name, type);
        });
        return result;
    }
}

const FIELD_TYPE = 'hasField';
const FIELD_NAME = 'name';
const SUPER_CLASS = 'isSuperClass';

export function isClassKind(kind: unknown): kind is ClassKind {
    return isKind(kind) && kind.$name === ClassKindName;
}
