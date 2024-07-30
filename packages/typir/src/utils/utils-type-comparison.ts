/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { assertUnreachable } from 'langium';
import { AssignabilityProblem } from '../features/assignability.js';
import { TypeEqualityProblem } from '../features/equality.js';
import { SubTypeProblem } from '../features/subtype.js';
import { Type } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { NameTypePair, assertTrue } from '../utils/utils.js';
import { InferenceProblem } from '../features/inference.js';
import { ValidationProblem } from '../features/validation.js';

export type TypeComparisonStrategy =
    'EQUAL_TYPE' | // the most strict checking
    'ASSIGNABLE_TYPE' | // SUB_TYPE or implicit conversion
    'SUB_TYPE'; // more relaxed checking

export function createTypeComparisonStrategy(strategy: TypeComparisonStrategy, typir: Typir): (t1: Type, t2: Type) => true | TypirProblem {
    switch (strategy) {
        case 'ASSIGNABLE_TYPE':
            return typir.assignability.isAssignable
                .bind(typir.assignability);
        case 'EQUAL_TYPE':
            return typir.equality.areTypesEqual
                .bind(typir.equality);
        case 'SUB_TYPE':
            return typir.subtype.isSubType
                .bind(typir.subtype);
            // .bind(...) is required to have the correct value for 'this' inside the referenced function/method!
            // see https://stackoverflow.com/questions/20279484/how-to-access-the-correct-this-inside-a-callback
        default:
            assertUnreachable(strategy);
    }
}

export type TypirProblem = ValueConflict | IndexedTypeConflict | AssignabilityProblem | SubTypeProblem | TypeEqualityProblem | InferenceProblem | ValidationProblem;

export interface ValueConflict {
    // 'undefined' means value is missing, 'string' is the string representation of the value
    firstValue: string | undefined;
    secondValue: string | undefined;
    location: string;
}
export function isValueConflict(problem: unknown): problem is ValueConflict {
    return typeof problem === 'object' && problem !== null
        && ((typeof (problem as ValueConflict).firstValue === 'string') || (typeof (problem as ValueConflict).secondValue === 'string'));
}
export function compareValueForConflict<T>(first: T, second: T, location: string,
    comparator: (e: T, a: T) => boolean = (e, a) => e === a): ValueConflict[] {
    const conflicts: ValueConflict[] = [];
    if (comparator(first, second) === false) {
        conflicts.push({
            firstValue: `${first}`,
            secondValue: `${second}`,
            location
        });
    }
    return conflicts;
}

export interface IndexedTypeConflict {
    // 'undefined' means type or information is missing, 'string' is for data which are no Types
    expected: Type | undefined; // first, left
    actual: Type | undefined; // second, right
    index: number | string;
    subProblems: TypirProblem[];
}
export function isIndexedTypeConflict(problem: unknown): problem is IndexedTypeConflict {
    return typeof problem === 'object' && problem !== null && ['string', 'number'].includes(typeof (problem as IndexedTypeConflict).index);
}

export function compareNameTypePairs(left: NameTypePair[], right: NameTypePair[], compareNames: boolean, comparatorTypes: (l: Type, r: Type) => (true | TypirProblem)): IndexedTypeConflict[] {
    const conflicts: IndexedTypeConflict[] = [];
    // compare first common indices
    for (let i = 0; i < left.length; i++) {
        const subProblems = compareNameTypePair(left[i], right[i], compareNames, comparatorTypes);
        if (subProblems.length >= 1) {
            conflicts.push({
                expected: left[i].type,
                actual: right[i].type,
                index: `${i}-${left[i].name}`,
                subProblems
            });
        } else {
            // everything is fine
        }
    }
    // existing in right, but missing in left
    for (let i = left.length; i < right.length; i++) {
        conflicts.push({
            expected: undefined,
            actual: right[i].type,
            index: `${i}-${right[i].name}`,
            subProblems: []
        });
    }
    // existing in left, but missing in right
    for (let i = right.length; i < left.length; i++) {
        conflicts.push({
            expected: left[i].type,
            actual: undefined,
            index: `${i}-${left[i].name}`,
            subProblems: []
        });
    }
    return conflicts;
}

export function compareNameTypePair(left: NameTypePair | undefined, right: NameTypePair | undefined, compareNames: boolean, comparatorTypes: (l: Type, r: Type) => (true | TypirProblem)): IndexedTypeConflict[] {
    const conflicts: IndexedTypeConflict[] = [];
    if ((left === undefined) && (right === undefined)) {
        // everything is fine
    } else if ((left !== undefined) && (right !== undefined)) {
        const subProblems: TypirProblem[] = [];
        if (compareNames) {
            subProblems.push(...compareValueForConflict(left.name, right.name, 'name'));
        }
        const typeComparison = comparatorTypes(left.type, right.type);
        if (typeComparison !== true) {
            subProblems.push(typeComparison);
        }
        if (subProblems.length >= 1) {
            conflicts.push({
                expected: left.type,
                actual: right.type,
                index: left.name,
                subProblems
            });
        } else {
            // everything is fine
        }
    } else if ((left === undefined) && (right !== undefined)) {
        conflicts.push({
            expected: undefined,
            actual: right.type,
            index: right.name,
            subProblems: []
        });
    } else if ((left !== undefined) && (right === undefined)) {
        conflicts.push({
            expected: left.type,
            actual: undefined,
            index: left.name,
            subProblems: []
        });
    } else {
        throw new Error();
    }
    return conflicts;
}

export function compareTypes(leftTypes: Array<Type | undefined>, rightTypes: Array<Type | undefined>, comparator: (l: Type, r: Type) => (true | TypirProblem)): IndexedTypeConflict[] {
    const conflicts: IndexedTypeConflict[] = [];
    // compare first common indices
    for (let i = 0; i < Math.min(leftTypes.length, rightTypes.length); i++) {
        const left = leftTypes[i];
        const right = rightTypes[i];
        if (left === undefined && right === undefined) {
            // everything is fine
        } else if (left !== undefined && right === undefined) {
            // missing in the right
            conflicts.push({
                expected: left,
                actual: undefined,
                index: i,
                subProblems: []
            });
        } else if (left === undefined && right !== undefined) {
            // missing in the right
            conflicts.push({
                expected: undefined,
                actual: right,
                index: i,
                subProblems: []
            });
        } else if (left !== undefined && right !== undefined) {
            // compare both existing types with each other
            const subProblem = comparator(left!, right!);
            if (subProblem !== true) {
                conflicts.push({
                    expected: left,
                    actual: right,
                    index: i,
                    subProblems: [subProblem]
                });
            } else {
                // everything is fine
            }
        } else {
            throw new Error();
        }
    }
    // missing in the left
    for (let i = leftTypes.length; i < rightTypes.length; i++) {
        conflicts.push({
            expected: undefined,
            actual: rightTypes[i],
            index: i,
            subProblems: []
        });
    }
    // missing in the right
    for (let i = rightTypes.length; i < leftTypes.length; i++) {
        conflicts.push({
            expected: leftTypes[i],
            actual: undefined,
            index: i,
            subProblems: []
        });
    }
    return conflicts;
}

export function compareNameTypesMap(sourceFields: Map<string, Type|undefined>, targetFields: Map<string, Type|undefined>, comparator: (s: Type, t: Type) => (true | TypirProblem)): IndexedTypeConflict[] {
    const targetCopy = new Map(targetFields);
    const conflicts: IndexedTypeConflict[] = [];
    for (const entry of sourceFields.entries()) {
        const sourceType = entry[1];
        const name = entry[0];
        if (targetCopy.has(name)) {
            // field exists in both maps
            const targetType = targetCopy.get(name);
            targetCopy.delete(name);
            if (sourceType === undefined && targetType === undefined) {
                // both types don't exist, this is OK
            } else if (sourceType === undefined && targetType !== undefined) {
                // only the target type exists
                conflicts.push({
                    expected: undefined,
                    actual: targetType,
                    index: name,
                    subProblems: []
                });
            } else if (sourceType !== undefined && targetType === undefined) {
                // only the source type exists
                conflicts.push({
                    expected: sourceType,
                    actual: undefined,
                    index: name,
                    subProblems: []
                });
            } else if (sourceType !== undefined && targetType !== undefined) {
                // both types exist => compare them
                const comparisonResult = comparator(sourceType, targetType);
                if (comparisonResult !== true) {
                    // different types
                    conflicts.push({
                        expected: sourceType,
                        actual: targetType,
                        index: name,
                        subProblems: [comparisonResult]
                    });
                } else {
                    // same type
                }
            } else {
                throw new Error('impossible case');
            }
        } else {
            // field is missing in target
            if (sourceType === undefined) {
                // this is OK
            } else {
                conflicts.push({
                    expected: sourceType,
                    actual: undefined,
                    index: name,
                    subProblems: []
                });
            }
        }
    }
    // fields are missing in source
    for (const [index, actual] of targetCopy.entries()) {
        if (actual === undefined) {
            // this is OK
        } else {
            conflicts.push({
                expected: undefined,
                actual,
                index,
                subProblems: []
            });
        }
    }
    return conflicts;
}

export class MapListConverter {
    protected names: string[] = [];

    toList<T>(values: Map<string, T>): T[] {
        this.names = [];
        return Array.from(values)
            .map(([fieldName, fieldType]) => ({ fieldName, fieldType }))
            .sort((e1, e2) => e1.fieldName.localeCompare(e2.fieldName))
            .map(e => {
                this.names.push(e.fieldName);
                return e.fieldType;
            });
    }

    toMap<T>(values: T[]): Map<string, T> {
        const result = new Map<string, T>();
        assertTrue(values.length === this.names.length);
        for (let i = 0; i < values.length; i++) {
            result.set(this.names[i], values[i]);
        }
        return result;
    }
}
