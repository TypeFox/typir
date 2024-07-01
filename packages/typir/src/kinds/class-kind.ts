/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { assertUnreachable } from 'langium';
import { TypeEdge } from '../graph/type-edge.js';
import { Type } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { IndexedTypeConflict, MapListConverter, TypeComparisonStrategy, TypirProblem, compareNameTypesMap, compareValueForConflict, createTypeComparisonStrategy } from '../utils/utils-type-comparison.js';
import { NameTypePair, assertTrue, toArray } from '../utils/utils.js';
import { Kind, isKind } from './kind.js';
import { InferenceProblem } from '../features/inference.js';

export interface ClassKindOptions {
    typing: 'Structural' | 'Nominal',
    /** Values < 0 indicate an arbitrary number of super classes. */
    maximumNumberOfSuperClasses: number,
    subtypeFieldChecking: TypeComparisonStrategy,
    /** Will be used only internally as prefix for the unique identifiers for class type names. */
    identifierPrefix: string,
}

export const ClassKindName = 'ClassKind';

export interface ClassTypeDetails<T = unknown> {
    className: string,
    superClasses?: Type | Type[],
    fields: NameTypePair[],
    inferenceRuleForDeclaration?: (domainElement: unknown) => boolean,
    inferenceRulesForLiterals?: InferClassLiteral<T>,
    inferenceRuleForFieldAccess?: (domainElement: unknown) => string | unknown | 'RULE_NOT_APPLICABLE', // name of the field | element to infer the type of the field (e.g. the type) | rule not applicable
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

    getClassType<T>(typeDetails: ClassTypeDetails<T> | string): Type | undefined { // string for nominal typing
        const key = this.printClassType(typeof typeDetails === 'string' ? { className: typeDetails, fields: []} : typeDetails);
        return this.typir.graph.getType(key);
    }

    getOrCreateClassType<T>(typeDetails: ClassTypeDetails<T>): Type {
        const result = this.getClassType(typeDetails);
        if (result) {
            return result;
        }
        return this.createClassType(typeDetails);
    }

    createClassType<T>(typeDetails: ClassTypeDetails<T>): Type {
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
            const edge = new TypeEdge(classType, fieldInfos.type, FIELD_TYPE);
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
        for (const superClass of theSuperClasses) {
            if (this.getAllSuperClasses(superClass, true).has(classType)) {
                throw new Error('Circle in super-sub-class-relationships are not allowed.');
            }
        }
        // link the new class to all its super classes
        for (const superr of theSuperClasses) {
            if (superr.kind.$name !== classType.kind.$name) {
                throw new Error();
            }
            const edge = new TypeEdge(classType, superr, SUPER_CLASS);
            this.typir.graph.addEdge(edge);
        }

        // register inference rules
        if (typeDetails.inferenceRuleForDeclaration) {
            this.typir.inference.addInferenceRule({
                isRuleApplicable(domainElement, _typir) {
                    if (typeDetails.inferenceRuleForDeclaration!(domainElement)) {
                        return classType;
                    } else {
                        return 'RULE_NOT_APPLICABLE';
                    }
                },
                inferType(_domainElement, _childrenTypes, _typir) {
                    // TODO check values for fields for nominal typing!
                    return classType;
                },
            });
        }
        if (typeDetails.inferenceRulesForLiterals) {
            const mapListConverter = new MapListConverter();
            this.typir.inference.addInferenceRule({
                isRuleApplicable(domainElement, _typir) {
                    const result = typeDetails.inferenceRulesForLiterals!.filter(domainElement);
                    if (result) {
                        const matching = typeDetails.inferenceRulesForLiterals!.matching(domainElement);
                        if (matching) {
                            const inputArguments = typeDetails.inferenceRulesForLiterals!.inputValuesForFields(domainElement);
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
                    return 'RULE_NOT_APPLICABLE';
                },
                inferType(domainElement, childrenTypes, typir) {
                    const allExpectedFields = classKind.getFields(classType, true);
                    // this class type might match, to be sure, resolve the types of the values for the parameters and continue to step 2
                    const comparedFieldsProblems = compareNameTypesMap(
                        allExpectedFields,
                        mapListConverter.toMap(childrenTypes),
                        createTypeComparisonStrategy(classKind.options.subtypeFieldChecking, typir)
                    );
                    if (comparedFieldsProblems.length >= 1) {
                        // (only) for overloaded functions, the types of the parameters need to be inferred in order to determine an exact match
                        return <InferenceProblem>{
                            domainElement,
                            inferenceCandidate: classType,
                            location: 'values for fields',
                            rule: this,
                            subProblems: comparedFieldsProblems,
                        };
                    } else {
                        // the current function is not overloaded, therefore, the types of their parameters are not required => save time, ignore inference errors
                        return classType;
                    }
                },
            });
        }
        if (typeDetails.inferenceRuleForFieldAccess) {
            this.typir.inference.addInferenceRule({
                isRuleApplicable(domainElement, _typir) {
                    const result = typeDetails.inferenceRuleForFieldAccess!(domainElement);
                    if (result === 'RULE_NOT_APPLICABLE') {
                        return 'RULE_NOT_APPLICABLE';
                    } else if (typeof result === 'string') {
                        // get the type of the given field name
                        const fieldType = classKind.getFields(classType, true).get(result);
                        if (fieldType) {
                            return fieldType;
                        }
                        throw new Error(`${result} is no known field`);
                    } else {
                        return result; // do the type inference for this element instead
                    }
                },
            });
        }

        return classType;
    }

    protected printClassType<T>(typeDetails: ClassTypeDetails<T>): string {
        const prefix = this.options.identifierPrefix;
        if (this.options.typing === 'Structural') {
            // fields
            const fields: string[] = [];
            for (const field of typeDetails.fields.entries()) {
                fields.push(`${field[0]}:${field[1].name}`);
            }
            // super classes
            const superClasses = toArray(typeDetails.superClasses);
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

    isSubType(superType: Type, subType: Type): TypirProblem[] {
        if (isClassKind(superType.kind) && isClassKind(subType.kind)) {
            if (this.options.typing === 'Structural') {
                // for structural typing, the sub type needs to have all fields of the super type with assignable types (including fields of all super classes):
                const conflicts: IndexedTypeConflict[] = [];
                const subFields = subType.kind.getFields(subType, true);
                for (const [superFieldName, superFieldType] of superType.kind.getFields(superType, true)) {
                    if (subFields.has(superFieldName)) {
                        // field is both in super and sub
                        const subFieldType = subFields.get(superFieldName)!;
                        const compareStrategy = createTypeComparisonStrategy(this.options.subtypeFieldChecking, this.typir);
                        const subTypeComparison = compareStrategy(subFieldType, superFieldType);
                        if (subTypeComparison !== true) {
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
                    const localResult = compareValueForConflict(superType.name, oneSub.name, 'name');
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
        throw new Error();
    }

    areTypesEqual(type1: Type, type2: Type): TypirProblem[] {
        if (isClassKind(type1.kind) && isClassKind(type2.kind)) {
            if (this.options.typing === 'Structural') {
                // for structural typing:
                return compareNameTypesMap(type1.kind.getFields(type1, true), type2.kind.getFields(type2, true),
                    (t1, t2) => this.typir.equality.areTypesEqual(t1, t2));
            } else if (this.options.typing === 'Nominal') {
                // for nominal typing:
                return compareValueForConflict(type1.name, type2.name, 'name');
            } else {
                assertUnreachable(this.options.typing);
            }
        }
        throw new Error();
    }

    getDeclaredSuperClasses(classType: Type): Type[] {
        return classType.getOutgoingEdges(SUPER_CLASS).map(edge => edge.to);
    }

    getDeclaredSubClasses(classType: Type): Type[] {
        return classType.getIncomingEdges(SUPER_CLASS).map(edge => edge.from);
    }

    getAllSuperClasses(classType: Type, includingGivenClass: boolean = false): Set<Type> {
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
