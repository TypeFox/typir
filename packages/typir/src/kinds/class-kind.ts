/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeComparisonStrategy, TypeConflict, createTypeComparisonStrategy, compareForConflict, compareNameTypesMap } from '../utils/utils-type-comparison.js';
import { TypeEdge } from '../graph/type-edge.js';
import { Type } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { NameTypePair } from '../utils/utils.js';
import { Kind, isKind } from './kind.js';

export interface ClassKindOptions {
    structuralTyping: boolean,
    maximumNumberOfSuperClasses: number, // values < 0 indicate an arbitrary number of super classes
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

    constructor(typir: Typir, options: ClassKindOptions) {
        this.$name = 'ClassKind';
        this.typir = typir;
        this.typir.registerKind(this);
        this.options = options;
    }

    createClassType(className: string, superClasses: Type[], ...fields: NameTypePair[]): Type {
        // create the class type
        const classType = new Type(this, className);
        this.typir.graph.addNode(classType);

        // FIELDS
        // link it to all its "field types"
        for (const fieldInfos of fields) {
            // new edge between class and field with "semantics key"
            const edge = new TypeEdge(classType, fieldInfos.type, FIELD_TYPE);
            // store the name of the field within the edge
            edge.properties.set(FIELD_NAME, fieldInfos.name);
            this.typir.graph.addEdge(edge);
        }
        // check collisions of field names
        if (this.getFields(classType, false).size !== fields.length) {
            throw new Error('field names must be unique!');
        }

        // SUB-SUPER-CLASSES
        // check number of allowed super classes
        if (this.options.maximumNumberOfSuperClasses >= 0) {
            if (this.options.maximumNumberOfSuperClasses < superClasses.length) {
                throw new Error(`Only ${this.options.maximumNumberOfSuperClasses} super-classes are allowed.`);
            }
        }
        // check cycles
        for (const superClass of superClasses) {
            if (this.getAllSuperClasses(superClass, true).has(classType)) {
                throw new Error('Circle in super-sub-class-relationships are not allowed.');
            }
        }
        // link the new class to all its super classes
        for (const superr of superClasses) {
            if (superr.kind.$name !== classType.kind.$name) {
                throw new Error();
            }
            const edge = new TypeEdge(classType, superr, SUPER_CLASS);
            this.typir.graph.addEdge(edge);
        }

        return classType;
    }

    getUserRepresentation(type: Type): string {
        const fields: string[] = [];
        for (const field of this.getFields(type, false).entries()) {
            fields.push(`${field[0]}: ${field[1].name}`);
        }
        return `${type.name} { ${fields.join(', ')} }`;
    }

    isSubType(superType: Type, subType: Type): TypeConflict[] {
        if (isClassKind(superType.kind) && isClassKind(subType.kind)) {
            const conflicts: TypeConflict[] = [];
            if (this.options.structuralTyping) {
                // for structural typing, the sub type needs to have all fields of the super type with assignable types (including fields of all super classes):
                const subFields = this.getFields(subType, true);
                for (const [superFieldName, superFieldType] of this.getFields(superType, true)) {
                    if (subFields.has(superFieldName)) {
                        // field is both in super and sub
                        const subFieldType = subFields.get(superFieldName)!;
                        const compareStrategy = createTypeComparisonStrategy(this.options.subtypeFieldChecking, this.typir);
                        conflicts.push(...compareStrategy(subFieldType, superFieldType));
                    } else {
                        // missing sub field
                        conflicts.push({
                            expected: superFieldType,
                            actual: undefined,
                            location: superFieldName,
                            action: 'SUB_TYPE'
                        });
                    }
                }
                // Note that it is not necessary to check, whether the sub class has additional fields than the super type!
            } else {
                // for nominal typing (super classes don't matter):
                conflicts.push(...compareForConflict(superType.name, subType.name, 'name', 'SUB_TYPE'));
            }
            return conflicts;
        }
        throw new Error();
    }

    areTypesEqual(type1: Type, type2: Type): TypeConflict[] {
        if (isClassKind(type1.kind) && isClassKind(type2.kind)) {
            const conflicts: TypeConflict[] = [];
            if (this.options.structuralTyping) {
                // for structural typing:
                conflicts.push(...compareNameTypesMap(this.getFields(type1, true), this.getFields(type2, true),
                    (t1, t2) => this.typir.equality.areTypesEqual(t1, t2), 'EQUAL_TYPE'));
            } else {
                // for nominal typing:
                conflicts.push(...compareForConflict(type1.name, type2.name, 'name', 'EQUAL_TYPE'));
            }
            return conflicts;
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
