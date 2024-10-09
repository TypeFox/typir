/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { assertUnreachable } from 'langium';
import { isType, Type } from '../graph/type-node.js';
import { TypirServices } from '../typir.js';
import { assertTrue } from '../utils/utils.js';
import { isSpecificTypirProblem, isNameTypePair, NameTypePair, TypirProblem } from './utils-definitions.js';
import { InferenceProblem } from '../features/inference.js';
import { Kind } from '../kinds/kind.js';

export type TypeCheckStrategy =
    'EQUAL_TYPE' | // the most strict checking
    'ASSIGNABLE_TYPE' | // SUB_TYPE or implicit conversion
    'SUB_TYPE'; // more relaxed checking

export function createTypeCheckStrategy(strategy: TypeCheckStrategy, typir: TypirServices): (t1: Type, t2: Type) => TypirProblem | undefined {
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

export interface ValueConflict extends TypirProblem {
    readonly $problem: 'ValueConflict';
    // 'undefined' means value is missing, 'string' is the string representation of the value
    firstValue: string | undefined;
    secondValue: string | undefined;
    location: string;
}
export const ValueConflict = 'ValueConflict';
export function isValueConflict(problem: unknown): problem is ValueConflict {
    return isSpecificTypirProblem(problem, ValueConflict);
}

export function checkValueForConflict<T>(first: T, second: T, location: string,
    relationToCheck: (e: T, a: T) => boolean = (e, a) => e === a): ValueConflict[] {
    const conflicts: ValueConflict[] = [];
    if (relationToCheck(first, second) === false) {
        conflicts.push({
            $problem: ValueConflict,
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
        $problem: ValueConflict,
        firstValue: first.$name,
        secondValue: second.$name,
        location: 'kind',
    };
}

export interface IndexedTypeConflict extends TypirProblem {
    $problem: 'IndexedTypeConflict';
    // 'undefined' means type or information is missing, 'string' is for data which are no Types
    expected: Type | undefined; // first, left
    actual: Type | undefined; // second, right
    // index OR name should be specified
    propertyIndex?: number;
    propertyName?: string;
    subProblems: TypirProblem[];
}
export const IndexedTypeConflict = 'IndexedTypeConflict';
export function isIndexedTypeConflict(problem: unknown): problem is IndexedTypeConflict {
    return isSpecificTypirProblem(problem, IndexedTypeConflict);
}

export type TypeToCheck = Type | NameTypePair | undefined | InferenceProblem[];

export function checkTypes(left: TypeToCheck, right: TypeToCheck,
    relationToCheck: (l: Type, r: Type) => (TypirProblem | undefined), checkNamesOfNameTypePairs: boolean): IndexedTypeConflict[] {
    const conflicts: IndexedTypeConflict[] = [];
    // check first common indices
    const leftInferenceProblems = Array.isArray(left);
    const rightInferenceProblems = Array.isArray(right);
    // check and report inference problems first; if both sides have inference problems, both are reported
    if (leftInferenceProblems) {
        // the left type is not inferrable
        conflicts.push({
            $problem: IndexedTypeConflict,
            expected: undefined,
            actual: isType(right) ? right : undefined,
            subProblems: left,
        });
    }
    if (rightInferenceProblems) {
        // the right type is not inferrable
        conflicts.push({
            $problem: IndexedTypeConflict,
            expected: isType(left) ? left : undefined,
            actual: undefined,
            subProblems: right,
        });
    }
    if (leftInferenceProblems || rightInferenceProblems) {
        return conflicts;
    }

    if (left === undefined && right === undefined) {
        // both types are missing => everything is fine
    } else if (left !== undefined && right === undefined) {
        // missing in the right
        conflicts.push(createOnlyLeftConflict(left, undefined));
    } else if (left === undefined && right !== undefined) {
        // missing in the left
        conflicts.push(createOnlyRightConflict(right, undefined));
    } else if (left !== undefined && right !== undefined) {
        // check both existing (name-)type(-pair)s with each other
        const isLeftPair = isNameTypePair(left);
        const isRightPair = isNameTypePair(right);
        const leftType = isLeftPair ? left.type : left;
        const rightType = isRightPair ? right.type : right;

        const subProblems: TypirProblem[] = [];
        if (isLeftPair && isRightPair && checkNamesOfNameTypePairs) {
            subProblems.push(...checkValueForConflict(left.name, right.name, 'name'));
        }
        const relationCheckResult = relationToCheck(leftType, rightType);
        if (relationCheckResult !== undefined) {
            subProblems.push(relationCheckResult);
        }

        if (subProblems.length >= 1) {
            conflicts.push({
                $problem: IndexedTypeConflict,
                expected: leftType,
                actual: rightType,
                propertyName: isLeftPair ? left.name : (isRightPair ? right.name : undefined),
                subProblems: subProblems,
            });
        } else {
            // everything is fine
        }
    } else {
        throw new Error();
    }
    return conflicts;
}

export function checkTypeArrays(leftTypes: TypeToCheck[], rightTypes: TypeToCheck[],
    relationToCheck: (l: Type, r: Type) => (TypirProblem | undefined), checkNamesOfNameTypePairs: boolean): IndexedTypeConflict[] {
    const conflicts: IndexedTypeConflict[] = [];
    // check first common indices
    for (let i = 0; i < Math.min(leftTypes.length, rightTypes.length); i++) {
        const currentProblems = checkTypes(leftTypes[i], rightTypes[i], relationToCheck, checkNamesOfNameTypePairs);
        currentProblems.forEach(p => p.propertyIndex = i); // add the index
        conflicts.push(...currentProblems);
    }
    // missing in the left
    for (let i = leftTypes.length; i < rightTypes.length; i++) {
        const right = rightTypes[i];
        if (Array.isArray(right)) {
            // the right type is not inferrable, while there is no left type
            conflicts.push({
                $problem: IndexedTypeConflict,
                expected: undefined,
                actual: undefined,
                propertyIndex: i,
                subProblems: right,
            });
        } else {
            conflicts.push(createOnlyRightConflict(right, i));
        }
    }
    // missing in the right
    for (let i = rightTypes.length; i < leftTypes.length; i++) {
        const left = leftTypes[i];
        if (Array.isArray(left)) {
            // the left type is not inferrable, while there is no right type
            conflicts.push({
                $problem: IndexedTypeConflict,
                expected: undefined,
                actual: undefined,
                propertyIndex: i,
                subProblems: left,
            });
        } else {
            conflicts.push(createOnlyLeftConflict(left, i));
        }
    }
    return conflicts;
}

function createOnlyLeftConflict(left: Type | NameTypePair | undefined, propertyIndex: number | undefined): IndexedTypeConflict {
    if (isNameTypePair(left)) {
        return {
            $problem: IndexedTypeConflict,
            expected: left.type,
            actual: undefined,
            propertyName: left.name,
            propertyIndex,
            subProblems: []
        };
    } else {
        return {
            $problem: IndexedTypeConflict,
            expected: left,
            actual: undefined,
            propertyIndex,
            subProblems: []
        };
    }
}
function createOnlyRightConflict(right: Type | NameTypePair | undefined, propertyIndex: number | undefined): IndexedTypeConflict {
    if (isNameTypePair(right)) {
        return {
            $problem: IndexedTypeConflict,
            expected: undefined,
            actual: right.type,
            propertyName: right.name,
            propertyIndex,
            subProblems: []
        };
    } else {
        return {
            $problem: IndexedTypeConflict,
            expected: undefined,
            actual: right,
            propertyIndex,
            subProblems: []
        };
    }
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
                    $problem: IndexedTypeConflict,
                    expected: undefined,
                    actual: targetType,
                    propertyName: name,
                    subProblems: []
                });
            } else if (sourceType !== undefined && targetType === undefined) {
                // only the source type exists
                conflicts.push({
                    $problem: IndexedTypeConflict,
                    expected: sourceType,
                    actual: undefined,
                    propertyName: name,
                    subProblems: []
                });
            } else if (sourceType !== undefined && targetType !== undefined) {
                // both types exist => check them
                const relationCheckResult = relationToCheck(sourceType, targetType);
                if (relationCheckResult !== undefined) {
                    // different types
                    conflicts.push({
                        $problem: IndexedTypeConflict,
                        expected: sourceType,
                        actual: targetType,
                        propertyName: name,
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
                    $problem: IndexedTypeConflict,
                    expected: sourceType,
                    actual: undefined,
                    propertyName: name,
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
                $problem: IndexedTypeConflict,
                expected: undefined,
                actual,
                propertyName: index,
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
