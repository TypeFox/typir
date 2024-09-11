/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/


/**
 * Typir provides a default set of Kinds, e.g. primitive types and class types.
 * For domain-specific kinds, implement this interface or create a new sub-class of an existing kind-class.
 */
export interface Kind {
    readonly $name: string;
}

export function isKind(kind: unknown): kind is Kind {
    return typeof kind === 'object' && kind !== null && typeof (kind as Kind).$name === 'string';
}
