/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type } from './graph/type-node.js';

export type Types = Type | Type[];

export type NameTypePair = {
    name: string;
    type: Type;
}

export type NameTypesPair = {
    name: string;
    type: Types;
}

export function compareNameTypePairs(left: NameTypePair[], right: NameTypePair[], comparator: (l: Type, r: Type) => boolean): boolean {
    if (left.length !== right.length) {
        return false;
    }
    for (let i = 0; i < left.length; i++) {
        if (compareNameTypePair(left[i], right[i], comparator) === false) {
            return false;
        }
    }
    return true;
}
export function compareNameTypePair(left: NameTypePair | undefined, right: NameTypePair | undefined, comparator: (l: Type, r: Type) => boolean): boolean {
    if ((left === undefined) !== (right === undefined)) {
        return false;
    }
    if (left && right) {
        return comparator(left.type, right.type);
    } else {
        return true;
    }
}

export function compareTypes(left: Type[], right: Type[], comparator: (l: Type, r: Type) => boolean): boolean {
    if (left.length !== right.length) {
        return false;
    }
    for (let i = 0; i < left.length; i++) {
        if (comparator(left[i], right[i]) === false) {
            return false;
        }
    }
    return true;
}

export function compareNameTypesMap(sourceFields: Map<string, Type>, targetFields: Map<string, Type>, comparator: (l: Type, r: Type) => boolean): boolean {
    if (sourceFields.size !== targetFields.size) {
        return false;
    }
    for (const entry of sourceFields.entries()) {
        const sourceType = entry[1];
        const targetType = targetFields.get(entry[0]);
        if (targetType === undefined || comparator(sourceType, targetType) === false) {
            return false;
        }
    }
    return true;
}

export function assertTrue(condition: boolean, msg?: string) {
    if (!condition) {
        throw new Error(msg);
    }
}

export function toArray<T>(value: undefined | T | T[]): T[] {
    if (!value) {
        return [];
    }
    if (Array.isArray(value)) {
        return value;
    }
    return [value];
}

export function assertUnreachable(_: never): never {
    throw new Error('Error! The input value was not handled.');
}
