/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { assertUnreachable } from 'langium';
import { isType, Type } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { assertTrue } from '../utils/utils.js';
import { NameTypePair, TypirProblem } from './utils-definitions.js';
import { Kind } from '../kinds/kind.js';

export type TypeCheckStrategy =
    'EQUAL_TYPE' | // the most strict checking
    'ASSIGNABLE_TYPE' | // SUB_TYPE or implicit conversion
    'SUB_TYPE'; // more relaxed checking

export function createTypeCheckStrategy(strategy: TypeCheckStrategy, typir: Typir): (t1: Type, t2: Type) => TypirProblem | undefined {
    switch (strategy) {
        case 'ASSIGNABLE_TYPE':
            return typir.assignability.getAssignabilityProblem // t1 === source, t2 === target
                .bind(typir.assignability);
        case 'EQUAL_TYPE':
            return typir.equality.getTypeEqualityProblem // (unordered, order does not matter)
                .bind(typir.equality);
        case 'SUB_TYPE':
            return typir.subtype.getSubTypeProblem // t1 === sub, t2 === super
                .bind(typir.subtype);
            // .bind(...) is required to have the correct value for 'this' inside the referenced function/method!
            // see https://stackoverflow.com/questions/20279484/how-to-access-the-correct-this-inside-a-callback
        default:
            assertUnreachable(strategy);
    }
}

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
export function checkValueForConflict<T>(first: T, second: T, location: string,
    relationToCheck: (e: T, a: T) => boolean = (e, a) => e === a): ValueConflict[] {
    const conflicts: ValueConflict[] = [];
    if (relationToCheck(first, second) === false) {
        conflicts.push({
            firstValue: `${first}`,
            secondValue: `${second}`,
            location
        });
    }
    return conflicts;
}

export function createKindConflict(first: Type | Kind, second: Type | Kind): ValueConflict {
    if (isType(first)) {
        first = first.kind;
    }
    if (isType(second)) {
        second = second.kind;
    }
    return {
        firstValue: first.$name,
        secondValue: second.$name,
        location: 'kind',
    };
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

export function checkNameTypePairs(left: NameTypePair[], right: NameTypePair[], checkNames: boolean, relationToCheck: (l: Type, r: Type) => (TypirProblem | undefined)): IndexedTypeConflict[] {
    const conflicts: IndexedTypeConflict[] = [];
    // check first common indices
    for (let i = 0; i < left.length; i++) {
        const subProblems = checkNameTypePair(left[i], right[i], checkNames, relationToCheck);
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

export function checkNameTypePair(left: NameTypePair | undefined, right: NameTypePair | undefined, checkNames: boolean, relationToCheck: (l: Type, r: Type) => (TypirProblem | undefined)): IndexedTypeConflict[] {
    const conflicts: IndexedTypeConflict[] = [];
    if ((left === undefined) && (right === undefined)) {
        // everything is fine
    } else if ((left !== undefined) && (right !== undefined)) {
        const subProblems: TypirProblem[] = [];
        if (checkNames) {
            subProblems.push(...checkValueForConflict(left.name, right.name, 'name'));
        }
        const relationCheckResult = relationToCheck(left.type, right.type);
        if (relationCheckResult !== undefined) {
            subProblems.push(relationCheckResult);
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

export function checkTypes(leftTypes: Array<Type | undefined>, rightTypes: Array<Type | undefined>, relationToCheck: (l: Type, r: Type) => (TypirProblem | undefined)): IndexedTypeConflict[] {
    const conflicts: IndexedTypeConflict[] = [];
    // check first common indices
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
            // check both existing types with each other
            const relationCheckResult = relationToCheck(left!, right!);
            if (relationCheckResult !== undefined) {
                conflicts.push({
                    expected: left,
                    actual: right,
                    index: i,
                    subProblems: [relationCheckResult]
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

export function checkNameTypesMap(sourceFields: Map<string, Type|undefined>, targetFields: Map<string, Type|undefined>, relationToCheck: (s: Type, t: Type) => (TypirProblem | undefined)): IndexedTypeConflict[] {
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
                // both types exist => check them
                const relationCheckResult = relationToCheck(sourceType, targetType);
                if (relationCheckResult !== undefined) {
                    // different types
                    conflicts.push({
                        expected: sourceType,
                        actual: targetType,
                        index: name,
                        subProblems: [relationCheckResult]
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
