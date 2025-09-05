/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { EdgeCachingInformation } from '../services/caching.js';
import { Type } from './type-node.js';

/**
 * An edge has a direction (from --> to) and can be querried from both types (incomingEdge, outgoingEdge).
 * Between the same from and to nodes, edges with different $relations are allowed, but not multiple edges with the same $relation (in the same direction).
 *
 * Bidirectional relationships are represented by a single edge in the type graph,
 * otherwise information stored along these edges must be duplicated and maintained.
 * Edges don't contain explicit information, wether they are unidirectional or bidirectional, since it is semantically encoded in the $relation.
 * Users of edges who know about the $relation also know, whether the corresponding edges are unidirectional or bidirectional.
 * Graph algorithms also know, whether they work on unidirectional or on bidirectional edges.
 *
 * Edges are realized as interfaces (and not as classes), since there are no methods to reuse or to override for customizations.
 */
export interface TypeEdge {
    readonly $relation: string;
    readonly from: Type;
    readonly to: Type;
    /** The default value is 'LINK_EXISTS'.
     * But edges might be used to explicitly indicate, that relationships are unclear or don't exist! */
    cachingInformation: EdgeCachingInformation;
}

export function isTypeEdge(edge: unknown): edge is TypeEdge {
    return typeof edge === 'object' && edge !== null && typeof (edge as TypeEdge).$relation === 'string';
}


export type EdgeDirection = 'Unidirectional' | 'Bidirectional';

export interface RelationInformation {
    $relation: TypeEdge['$relation'];
    direction: EdgeDirection;
}
