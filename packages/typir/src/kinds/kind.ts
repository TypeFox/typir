/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type } from '../graph/type-node.js';
import { TypirProblem } from '../utils/utils-type-comparison.js';

/**
 * Typir provides a default set of Kinds, e.g. primitive types and class types.
 * For domain-specific kinds, implement this interface or create a new sub-class of an existing kind-class.
 */
export interface Kind {
    readonly $name: string;

    getUserRepresentation(type: Type): string;

    /** If the kinds of super type and sub type are different, this function will be called for both kinds in order to check,
     * whether at least one kinds reports a sub-type-relationship. */
    analyzeSubTypeProblems(superType: Type, subType: Type): TypirProblem[];

    analyzeTypeEqualityProblems(type1: Type, type2: Type): TypirProblem[];
}

export function isKind(kind: unknown): kind is Kind {
    return typeof kind === 'object' && kind !== null && typeof (kind as Kind).$name === 'string';
}
