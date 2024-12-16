/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeEdge } from '../graph/type-edge.js';
import { TypeGraph } from '../graph/type-graph.js';
import { Type } from '../graph/type-node.js';
import { TypirServices } from '../typir.js';
import { assertTrue } from '../utils/utils.js';

/**
 * Caches relationships between types.
 */
export interface TypeRelationshipCaching {
    getRelationshipUnidirectional<T extends TypeEdge>(from: Type, to: Type, $relation: T['$relation']): T | undefined;
    getRelationshipBidirectional<T extends TypeEdge>(from: Type, to: Type, $relation: T['$relation']): T | undefined;

    setOrUpdateUnidirectionalRelationship<T extends TypeEdge>(edgeToCache: T, edgeCaching: EdgeCachingInformation): T | undefined;
    setOrUpdateBidirectionalRelationship<T extends TypeEdge>(edgeToCache: T, edgeCaching: EdgeCachingInformation): T | undefined;
}

export type EdgeCachingInformation =
    /** The analysis, whether the current relationship holds, is still ongoing. */
    'PENDING' |
    /** It is unknown, whether the current relationship holds */
    'UNKNOWN' |
    /** The current relationship exists. */
    'LINK_EXISTS' |
    /** The current relationship does not exist. */
    'NO_LINK';

export class DefaultTypeRelationshipCaching implements TypeRelationshipCaching {
    protected readonly graph: TypeGraph;

    constructor(services: TypirServices) {
        this.graph = services.infrastructure.Graph;
    }

    getRelationshipUnidirectional<T extends TypeEdge>(from: Type, to: Type, $relation: T['$relation']): T | undefined {
        return from.getOutgoingEdges<T>($relation).find(edge => edge.to === to);
    }
    getRelationshipBidirectional<T extends TypeEdge>(from: Type, to: Type, $relation: T['$relation']): T | undefined {
        // for bidirectional edges, check outgoing and incoming edges, since the graph contains only a single edge!
        return from.getEdges<T>($relation).find(edge => edge.to === to);
    }

    setOrUpdateUnidirectionalRelationship<T extends TypeEdge>(edgeToCache: T, edgeCaching: EdgeCachingInformation): T | undefined {
        return this.setOrUpdateRelationship(edgeToCache, edgeCaching, false);
    }
    setOrUpdateBidirectionalRelationship<T extends TypeEdge>(edgeToCache: T, edgeCaching: EdgeCachingInformation): T | undefined {
        return this.setOrUpdateRelationship(edgeToCache, edgeCaching, true);
    }

    protected setOrUpdateRelationship<T extends TypeEdge>(edgeToCache: T, edgeCaching: EdgeCachingInformation, bidirectional: boolean): T | undefined {
        // identify the edge to store the value
        const edge: T | undefined = bidirectional
            ? this.getRelationshipBidirectional(edgeToCache.from, edgeToCache.to, edgeToCache.$relation)
            : this.getRelationshipUnidirectional(edgeToCache.from, edgeToCache.to, edgeToCache.$relation);

        // don't cache some values (but ensure, that PENDING is overridden/updated!) =>  un-set the relationship
        if (this.storeCachingInformation(edgeCaching) === false) {
            if (edge) {
                this.graph.removeEdge(edge);
            } else {
                // no edge exists, no edge wanted => nothing to do
            }
            return undefined;
        }

        // handle missing edge
        if (!edge) {
            // reuse the given edge
            this.graph.addEdge(edgeToCache);
            // in case of non-directed edges, check the opposite direction as well
            return edgeToCache;
        }

        // set/update the values of the existing edge
        edge.cachingInformation = edgeCaching;
        assertTrue(edge.$relation === edgeToCache.$relation);
        // update data of specific edges!
        // Object.assign throws an error for readonly properties => it cannot be used here!
        const propertiesToIgnore: Array<keyof TypeEdge> = ['from', 'to', '$relation', 'cachingInformation'];
        const keys = Object.keys(edgeToCache) as Array<keyof T>;
        for (const v of keys) {
            if (propertiesToIgnore.includes(v as keyof TypeEdge)) {
                // don't update these properties
            } else {
                edge[v] = edgeToCache[v];
            }
        }
        return edge as T;
    }

    /** Override this function to store more or less relationships in the type graph. */
    protected storeCachingInformation(value: EdgeCachingInformation | undefined): boolean {
        return value === 'PENDING' || value === 'LINK_EXISTS';
    }
}


/**
 * Domain element-to-Type caching for type inference.
 */
export interface DomainElementInferenceCaching {
    cacheSet(domainElement: unknown, type: Type): void;
    cacheGet(domainElement: unknown): Type | undefined;
    pendingSet(domainElement: unknown): void;
    pendingClear(domainElement: unknown): void;
    pendingGet(domainElement: unknown): boolean;
}

export type CachePending = 'CACHE_PENDING';
export const CachePending = 'CACHE_PENDING';

export class DefaultDomainElementInferenceCaching implements DomainElementInferenceCaching {
    protected cache: Map<unknown, Type | CachePending>;

    constructor() {
        this.initializeCache();
    }

    protected initializeCache() {
        this.cache = new Map();
    }

    cacheSet(domainElement: unknown, type: Type): void {
        this.pendingClear(domainElement);
        this.cache.set(domainElement, type);
    }

    cacheGet(domainElement: unknown): Type | undefined {
        if (this.pendingGet(domainElement)) {
            return undefined;
        } else {
            return this.cache.get(domainElement) as (Type | undefined);
        }
    }

    pendingSet(domainElement: unknown): void {
        this.cache.set(domainElement, CachePending);
    }

    pendingClear(domainElement: unknown): void {
        if (this.cache.get(domainElement) !== CachePending) {
            // do nothing
        } else {
            this.cache.delete(domainElement);
        }
    }

    pendingGet(domainElement: unknown): boolean {
        return this.cache.has(domainElement) && this.cache.get(domainElement) === CachePending;
    }
}
