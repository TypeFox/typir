/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeEdge } from '../graph/type-edge.js';
import { Type } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { assertTrue } from '../utils/utils.js';

/**
 * Caches relationships between types.
 */
export interface TypeRelationshipCaching {
    getRelationship<T extends TypeEdge>(from: Type, to: Type, $meaning: T['$meaning'], directed: boolean): T | undefined;
    setOrUpdateRelationship<T extends TypeEdge>(edgeToCache: T, directed: boolean, newRelationship: CachingKind): void;
}

export type CachingKind = 'PENDING' | 'UNKNOWN' | 'LINK_EXISTS' | 'NO_LINK';

export class DefaultTypeRelationshipCaching implements TypeRelationshipCaching {
    protected readonly typir: Typir;

    constructor(typir: Typir) {
        this.typir = typir;
    }

    getRelationship<T extends TypeEdge>(from: Type, to: Type, $meaning: T['$meaning'], directed: boolean): T | undefined {
        let edge = this.getEdge(from, to, $meaning);
        if (!edge && directed === false) {
            // in case of non-directed edges, check the opposite direction as well
            edge = this.getEdge(to, from, $meaning);
        }
        return edge;
    }

    setOrUpdateRelationship<T extends TypeEdge>(edgeToCache: T, _directed: boolean, newRelationship: CachingKind): void {
        // identify the edge to store the value
        let edge = this.getEdge<T>(edgeToCache.from, edgeToCache.to, edgeToCache.$meaning);

        // don't cache some values (but ensure, that PENDING is overridden/updated!) =>  un-set the relationship
        if (this.storeKind(newRelationship) === false) {
            if (edge) {
                this.typir.graph.removeEdge(edge);
            } else {
                // no edge exists, no edge wanted => nothing to do
            }
            return;
        }

        // handle missing edge
        if (!edge) {
            edge = edgeToCache; // reuse the given edge
            this.typir.graph.addEdge(edge);
            return;
        }

        // set/update the values of the existing edge
        edge.cachingInformation = newRelationship;
        assertTrue(edge.$meaning === edgeToCache.$meaning);
        // update data of specific edges!
        const propertiesToIgnore: Array<keyof TypeEdge> = ['from', 'to', '$meaning', 'cachingInformation'];
        for (const v of Object.keys(edgeToCache)) {
            if (propertiesToIgnore.includes(v as keyof TypeEdge)) {
                // don't update these properties
            } else {
                edge[v as keyof T] = edgeToCache[v as keyof T];
            }
        }
    }

    /** Override this function to store more or less relationships. */
    protected storeKind(value: CachingKind | undefined): boolean {
        // return value === 'PENDING' || value === 'LINK_EXISTS';
        return value === 'PENDING';
    }

    protected getEdge<T extends TypeEdge>(from: Type, to: Type, $meaning: T['$meaning']): T | undefined {
        return from.getOutgoingEdges<T>($meaning).find(edge => edge.to === to);
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
    protected readonly typir: Typir;
    protected cache: Map<unknown, Type | CachePending>;

    constructor(typir: Typir) {
        this.typir = typir;
        this.initializeCache();
    }

    protected initializeCache() {
        // TODO reset cache for updated Langium documents!
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
