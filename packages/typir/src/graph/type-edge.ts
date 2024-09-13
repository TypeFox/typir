/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { CachingKind } from '../features/caching.js';
import { Type } from './type-node.js';

export interface TypeEdge {
    readonly $meaning: string;
    readonly from: Type;
    readonly to: Type;
    cachingInformation?: CachingKind;
}

export function isTypeEdge(edge: unknown): edge is TypeEdge {
    return typeof edge === 'object' && edge !== null && typeof (edge as TypeEdge).$meaning === 'string';
}
