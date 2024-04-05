/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { assertUnreachable } from 'langium';
import { NameTypePair, Type } from '../index.js';
import { Typir } from '../typir.js';

export type TypeComparisonStrategy =
    'EQUAL_TYPE' | // the most strict checking
    'ASSIGNABLE_TYPE' | // SUB_TYPE or implicit conversion
    'SUB_TYPE'; // more relaxed checking
export function createTypeComparisonStrategy(strategy: TypeComparisonStrategy, typir: Typir): (t1: Type, t2: Type) => TypeConflict[] {
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
            // .bind is required to have the correct value for 'this' inside the referenced function/method!
            // see https://stackoverflow.com/questions/20279484/how-to-access-the-correct-this-inside-a-callback
        default:
            assertUnreachable(strategy);
    }
}

export interface TypeConflict {
    // 'undefined' means type or information is missing
    expected: Type | string | undefined; // first, left
    actual: Type | string | undefined; // second, right
    location: string;
    innerConflicts?: TypeConflict[];
}

export function compareForConflict<T>(expected: T, actual: T, location: string,
    comparator: (e: T, a: T) => boolean = (e, a) => e === a): TypeConflict[] {
    const conflicts: TypeConflict[] = [];
    if (comparator(expected, actual) === false) {
        conflicts.push({
            expected: `${expected}`,
            actual: `${actual}`,
            location
        });
    }
    return conflicts;
}

export function createConflict(expected: Type | string, actual: Type | string, location: string): TypeConflict {
    return {
        expected: expected,
        actual: actual,
        location
    };
}

export function compareNameTypePairs(left: NameTypePair[], right: NameTypePair[], comparator: (l: Type, r: Type) => TypeConflict[]): TypeConflict[] {
    const conflicts: TypeConflict[] = [];
    // compare first common indices
    for (let i = 0; i < left.length; i++) {
        conflicts.push(...compareNameTypePair(left[i], right[i], comparator));
    }
    // missing in the left
    for (let i = left.length; i < right.length; i++) {
        conflicts.push({
            expected: undefined,
            actual: right[i].type,
            location: `left-${i}-${right[i].name}`
        });
    }
    // missing in the right
    for (let i = right.length; i < left.length; i++) {
        conflicts.push({
            expected: left[i].type,
            actual: undefined,
            location: `right-${i}-${left[i].name}`
        });
    }
    return conflicts;
}

export function compareNameTypePair(left: NameTypePair | undefined, right: NameTypePair | undefined, comparator: (l: Type, r: Type) => TypeConflict[]): TypeConflict[] {
    const conflicts: TypeConflict[] = [];
    if ((left === undefined) && (right === undefined)) {
        // everything is fine
    } else if ((left !== undefined) && (right !== undefined)) {
        conflicts.push(...comparator(left.type, right.type));
    } else if ((left === undefined) && (right !== undefined)) {
        conflicts.push({
            expected: undefined,
            actual: right.type,
            location: right.name
        });
    } else if ((left !== undefined) && (right === undefined)) {
        conflicts.push({
            expected: left.type,
            actual: undefined,
            location: left.name
        });
    } else {
        throw new Error();
    }
    return conflicts;
}

export function compareTypes(left: Type[], right: Type[], comparator: (l: Type, r: Type) => TypeConflict[]): TypeConflict[] {
    const conflicts: TypeConflict[] = [];
    // compare first common indices
    for (let i = 0; i < Math.min(left.length, right.length); i++) {
        conflicts.push(...comparator(left[i], right[i]));
    }
    // missing in the left
    for (let i = left.length; i < right.length; i++) {
        conflicts.push({
            expected: undefined,
            actual: right[i],
            location: `left-${i}`
        });
    }
    // missing in the right
    for (let i = right.length; i < left.length; i++) {
        conflicts.push({
            expected: left[i],
            actual: undefined,
            location: `right-${i}`
        });
    }
    return conflicts;
}

export function compareNameTypesMap(sourceFields: Map<string, Type>, targetFields: Map<string, Type>, comparator: (l: Type, r: Type) => TypeConflict[]): TypeConflict[] {
    const targetCopy = new Map(targetFields);
    const conflicts: TypeConflict[] = [];
    for (const entry of sourceFields.entries()) {
        const sourceType = entry[1];
        const name = entry[0];
        if (targetCopy.has(name)) {
            // field exists in both maps
            const targetType = targetCopy.get(name)!;
            targetCopy.delete(name);
            const comparisonResult = comparator(sourceType, targetType);
            if (comparisonResult.length >= 1) {
                // different types
                conflicts.push({
                    expected: sourceType,
                    actual: targetType,
                    location: name,
                    innerConflicts: comparisonResult
                });
            } else {
                // same type
            }
        } else {
            // field is missing in target
            conflicts.push({
                expected: sourceType,
                actual: undefined,
                location: name
            });
        }
    }
    // fields are missing in source
    for (const entry of targetCopy.entries()) {
        conflicts.push({
            expected: undefined,
            actual: entry[1],
            location: entry[0]
        });
    }
    return conflicts;
}
