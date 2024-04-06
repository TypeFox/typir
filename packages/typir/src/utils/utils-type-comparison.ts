/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { assertUnreachable } from 'langium';
import { NameTypePair } from '../utils/utils.js';
import { Type } from '../graph/type-node.js';
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
            // .bind(...) is required to have the correct value for 'this' inside the referenced function/method!
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
    action: TypeComparisonStrategy;
    subConflicts?: TypeConflict[];
}

export function compareForConflict<T>(expected: T, actual: T, location: string, action: TypeComparisonStrategy,
    comparator: (e: T, a: T) => boolean = (e, a) => e === a): TypeConflict[] {
    const conflicts: TypeConflict[] = [];
    if (comparator(expected, actual) === false) {
        conflicts.push({
            expected: `${expected}`,
            actual: `${actual}`,
            location,
            action,
        });
    }
    return conflicts;
}

export function createConflict(expected: Type | string, actual: Type | string, location: string, action: TypeComparisonStrategy): TypeConflict {
    return {
        expected: expected,
        actual: actual,
        location,
        action,
    };
}

export function compareNameTypePairs(left: NameTypePair[], right: NameTypePair[], compareNames: boolean, comparatorTypes: (l: Type, r: Type) => TypeConflict[], action: TypeComparisonStrategy): TypeConflict[] {
    const conflicts: TypeConflict[] = [];
    // compare first common indices
    for (let i = 0; i < left.length; i++) {
        const subConflicts = compareNameTypePair(left[i], right[i], compareNames, comparatorTypes, action);
        if (subConflicts.length >= 1) {
            conflicts.push({
                expected: left[i].type,
                actual: right[i].type,
                location: `index ${i} with name '${left[i].name}'`,
                action,
                subConflicts,
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
            location: `index ${i} with name '${right[i].name}'`,
            action,
        });
    }
    // existing in left, but missing in right
    for (let i = right.length; i < left.length; i++) {
        conflicts.push({
            expected: left[i].type,
            actual: undefined,
            location: `index ${i} with name '${left[i].name}'`,
            action,
        });
    }
    return conflicts;
}

export function compareNameTypePair(left: NameTypePair | undefined, right: NameTypePair | undefined, compareNames: boolean, comparatorTypes: (l: Type, r: Type) => TypeConflict[], action: TypeComparisonStrategy): TypeConflict[] {
    const conflicts: TypeConflict[] = [];
    if ((left === undefined) && (right === undefined)) {
        // everything is fine
    } else if ((left !== undefined) && (right !== undefined)) {
        const subConflicts = [];
        if (compareNames) {
            compareForConflict(left.name, right.name, 'name', action);
        }
        subConflicts.push(...comparatorTypes(left.type, right.type));
        if (subConflicts.length >= 1) {
            conflicts.push({
                expected: left.type,
                actual: right.type,
                location: `type for '${left.name}'`,
                action,
                subConflicts,
            });
        } else {
            // everything is fine
        }
    } else if ((left === undefined) && (right !== undefined)) {
        conflicts.push({
            expected: undefined,
            actual: right.type,
            location: `type for '${right.name}'`,
            action,
        });
    } else if ((left !== undefined) && (right === undefined)) {
        conflicts.push({
            expected: left.type,
            actual: undefined,
            location: `type for '${left.name}'`,
            action,
        });
    } else {
        throw new Error();
    }
    return conflicts;
}

export function compareTypes(left: Type[], right: Type[], comparator: (l: Type, r: Type) => TypeConflict[], action: TypeComparisonStrategy): TypeConflict[] {
    const conflicts: TypeConflict[] = [];
    // compare first common indices
    for (let i = 0; i < Math.min(left.length, right.length); i++) {
        const subConflicts = comparator(left[i], right[i]);
        if (subConflicts.length >= 1) {
            conflicts.push({
                expected: left[i],
                actual: right[i],
                location: `index ${i}`,
                action,
                subConflicts,
            });
        } else {
            // everything is fine
        }
    }
    // missing in the left
    for (let i = left.length; i < right.length; i++) {
        conflicts.push({
            expected: undefined,
            actual: right[i],
            location: `index ${i}`,
            action,
        });
    }
    // missing in the right
    for (let i = right.length; i < left.length; i++) {
        conflicts.push({
            expected: left[i],
            actual: undefined,
            location: `index ${i}`,
            action,
        });
    }
    return conflicts;
}

export function compareNameTypesMap(sourceFields: Map<string, Type>, targetFields: Map<string, Type>, comparator: (l: Type, r: Type) => TypeConflict[], action: TypeComparisonStrategy): TypeConflict[] {
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
                    location: `property '${name}'`,
                    action,
                    subConflicts: comparisonResult,
                });
            } else {
                // same type
            }
        } else {
            // field is missing in target
            conflicts.push({
                expected: sourceType,
                actual: undefined,
                location: `property '${name}'`,
                action,
            });
        }
    }
    // fields are missing in source
    for (const entry of targetCopy.entries()) {
        conflicts.push({
            expected: undefined,
            actual: entry[1],
            location: `property '${entry[0]}'`,
            action,
        });
    }
    return conflicts;
}
