/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type } from "../graph/type-node.js";
import { Kind } from "../kinds/kind.js";

export function assertTrue(
    condition: boolean,
    msg?: string,
): asserts condition {
    if (!condition) {
        throw new Error(msg);
    }
}

export function toArray<T>(
    value: undefined | T | T[],
    options?: { newArray: boolean },
): T[] {
    if (value === undefined) {
        return [];
    }
    if (Array.isArray(value)) {
        if (options?.newArray) {
            return [...value];
        } else {
            return value;
        }
    }
    return [value];
}
export function toArrayWithValue<T>(
    value: T,
    array?: undefined | T | T[],
): T[] {
    if (array === undefined) {
        return [value];
    }
    if (Array.isArray(array)) {
        array.push(value);
        return array;
    }
    return [array, value];
}

export function removeFromArray<T>(
    value: T | undefined,
    array: T[] | undefined,
): boolean {
    if (value === undefined || array === undefined) {
        return false;
    }
    const index = array.indexOf(value);
    if (index >= 0) {
        array.splice(index, 1);
        return true;
    } else {
        return false;
    }
}

export function assertUnreachable(_: never): never {
    throw new Error("Error! The input value was not handled.");
}

export function assertKind<T extends Kind>(
    kind: unknown,
    check: (kind: unknown) => kind is T,
    msg?: string,
): asserts kind is T {
    if (check(kind)) {
        // this is the expected case
    } else {
        throw new Error(msg ?? `'${kind}' has another kind`);
    }
}

export function assertTypirType<T extends Type>(
    type: unknown,
    check: (type: unknown) => type is T,
    msg?: string,
): asserts type is T {
    if (check(type)) {
        // this is the expected case
    } else {
        throw new Error(msg ?? `'${type}' has another type`);
    }
}
