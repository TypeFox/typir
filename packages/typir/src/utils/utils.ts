/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type } from '../graph/type-node.js';

export type Types = Type | Type[];
export type Names = string | string[];

export type NameTypePair = {
    name: string;
    type: Type;
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
