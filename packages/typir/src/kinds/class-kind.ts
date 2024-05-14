/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeEdge } from '../graph/type-edge.js';
import { Type } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { IndexedTypeConflict, TypeComparisonStrategy, TypirProblem, compareNameTypesMap, compareValueForConflict, createTypeComparisonStrategy } from '../utils/utils-type-comparison.js';
import { NameTypePair, toArray } from '../utils/utils.js';
import { Kind, isKind } from './kind.js';

export interface ClassKindOptions {
    structuralTyping: boolean,
    /** Values < 0 indicate an arbitrary number of super classes. */
    maximumNumberOfSuperClasses: number,
    subtypeFieldChecking: TypeComparisonStrategy,
}

export const ClassKindName = 'ClassKind';

/**
 * Classes have a name and have an arbitrary number of fields, consisting of a name and a type, and an arbitrary number of super-classes.
 * Fields have exactly one type and no multiplicity (which can be realized with a type of kind 'MultiplicityKind').
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
            structuralTyping: false,
            maximumNumberOfSuperClasses: 1,
            subtypeFieldChecking: 'EQUAL_TYPE',
            // the actually overriden values:
            ...options
        };
    }

    createClassType(typeDetails: {
        className: string,
        superClasses?: Type | Type[],
        fields: NameTypePair[]
    }): Type {
        const theSuperClasses = toArray(typeDetails.superClasses);

        // create the class type
        const classType = new Type(this, typeDetails.className);
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

        return classType;
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
            if (this.options.structuralTyping) {
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
            } else {
                // for nominal typing (super classes don't matter):
                return compareValueForConflict(superType.name, subType.name, 'name');
            }
        }
        throw new Error();
    }

    areTypesEqual(type1: Type, type2: Type): TypirProblem[] {
        if (isClassKind(type1.kind) && isClassKind(type2.kind)) {
            if (this.options.structuralTyping) {
                // for structural typing:
                return compareNameTypesMap(type1.kind.getFields(type1, true), type2.kind.getFields(type2, true),
                    (t1, t2) => this.typir.equality.areTypesEqual(t1, t2));
            } else {
                // for nominal typing:
                return compareValueForConflict(type1.name, type2.name, 'name');
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
        // in case of conflicting field names, the type of the sub-class takes precedence!
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
