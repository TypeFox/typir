/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type } from '../graph/type-node.js';
import { Kind } from '../kinds/kind.js';

export function assertTrue(condition: boolean, msg?: string): asserts condition {
    if (!condition) {
        throw new Error(msg);
    }
}

export function toArray<T>(value: undefined | T | T[]): T[] {
    if (value === undefined) {
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

export function assertKind<T extends Kind>(kind: unknown, check: (kind: unknown) => kind is T, msg?: string): asserts kind is T {
    if (check(kind)) {
        // this is the expected case
    } else {
        throw new Error(msg ?? `'${kind}' has another kind`);
    }
}

export function assertType<T extends Type>(type: unknown, check: (type: unknown) => type is T, msg?: string): asserts type is T {
    if (check(type)) {
        // this is the expected case
    } else {
        throw new Error(msg ?? `'${type}' has another type`);
    }
}
