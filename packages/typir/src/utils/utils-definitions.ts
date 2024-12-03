/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

/* eslint-disable @typescript-eslint/no-explicit-any */

import { isType, Type } from '../graph/type-node.js';
import { TypeInitializer } from '../initialization/type-initializer.js';

/**
 * Common interface of all problems/errors/messages which should be shown to users of DSLs which are type-checked with Typir.
 * This approach makes it easier to introduce additional errors by users of Typir, compared to a union type, e.g. export type TypirProblem = ValueConflict | IndexedTypeConflict | ...
 */
export interface TypirProblem {
    readonly $problem: string;
}
export function isSpecificTypirProblem(problem: unknown, $problem: string): problem is TypirProblem {
    return typeof problem === 'object' && problem !== null && ((problem as TypirProblem).$problem === $problem);
}

export type Types = Type | Type[];
export type Names = string | string[];
export type TypeInitializers<T extends Type = Type> = TypeInitializer<T> | Array<TypeInitializer<T>>;

export type NameTypePair = {
    name: string;
    type: Type;
}
export function isNameTypePair(type: unknown): type is NameTypePair {
    return typeof type === 'object' && type !== null && typeof (type as NameTypePair).name === 'string' && isType((type as NameTypePair).type);
}
