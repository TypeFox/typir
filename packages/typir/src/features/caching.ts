/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeEdge } from '../graph/type-edge.js';
import { Type } from '../graph/type-node.js';
import { Typir } from '../typir.js';

/**
 * Caches relationships between types.
 */
export interface TypeRelationshipCaching {
    getRelationship(from: Type, to: Type, meaning: string, directed: boolean): { relationship: RelationshipKind, additionalData: unknown };
    setRelationship(from: Type, to: Type, meaning: string, directed: boolean, newRelationship: RelationshipKind | undefined, additionalData: unknown): void;
}

export type RelationshipKind = 'PENDING' | 'UNKNOWN' | 'LINK_EXISTS' | 'NO_LINK';

export class DefaultTypeRelationshipCaching implements TypeRelationshipCaching {
    protected readonly typir: Typir;

    constructor(typir: Typir) {
        this.typir = typir;
    }

    getRelationship(from: Type, to: Type, meaning: string, directed: boolean): { relationship: RelationshipKind, additionalData: unknown } {
        let edge = this.getEdge(from, to, meaning);
        if (!edge && directed === false) {
            // in case of non-directed edges, check the opposite direction as well
            edge = this.getEdge(to, from, meaning);
        }
        if (edge) {
            const result = edge.properties.get(TYPE_CACHING_RELATIONSHIP);
            if (result && typeof result === 'string') {
                return {
                    relationship: result as RelationshipKind,
                    additionalData: edge.properties.get(TYPE_CACHING_ADDITIONAL),
                };
            }
        }
        return { relationship: 'UNKNOWN', additionalData: undefined };
    }

    setRelationship(from: Type, to: Type, meaning: string, _directed: boolean, newRelationship: RelationshipKind | undefined, additionalData: unknown = undefined): void {
        // don't cache some values (but ensure, that PENDING is overridden/updated!)
        if (this.storeKind(newRelationship) === false) {
            newRelationship = undefined; // 'undefined' indicates to remove an existing edge
        }

        // manage the edge to store the value
        let edge = this.getEdge(from, to, meaning);
        if (newRelationship === undefined) {
            // un-set the relationship
            if (edge) {
                this.typir.graph.removeEdge(edge);
            }
            return;
        }
        if (!edge) {
            // create missing edge
            edge = new TypeEdge(from, to, meaning);
            this.typir.graph.addEdge(edge);
        }

        // set/update the values of the edge
        edge.properties.set(TYPE_CACHING_RELATIONSHIP, newRelationship);
        if (this.storeAdditionalData(additionalData)) {
            edge.properties.set(TYPE_CACHING_ADDITIONAL, additionalData);
        } else {
            edge.properties.delete(TYPE_CACHING_ADDITIONAL);
        }
    }

    /** Override this function to store more or less relationships. */
    protected storeKind(value: RelationshipKind | undefined): boolean {
        // return value === 'PENDING' || value === 'LINK_EXISTS';
        return value === 'PENDING';
    }

    /** Override this function to store more (or less) data like 'undefined'. */
    protected storeAdditionalData(additionalData: unknown): boolean {
        if (additionalData) {
            return true;
        }
        return false;
    }

    protected getEdge(from: Type, to: Type, meaning: string): TypeEdge | undefined {
        return from.getOutgoingEdges(meaning).find(edge => edge.to === to);
    }
}

const TYPE_CACHING_RELATIONSHIP = 'TypeRelationshipCaching_Kind';
const TYPE_CACHING_ADDITIONAL = 'TypeRelationshipCaching_Additional';


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

export class DefaultDomainElementInferenceCaching implements DomainElementInferenceCaching {
    protected readonly typir: Typir;
    /** 'undefined' marks the 'pending' case */
    protected cache: Map<unknown, Type | undefined> = new Map(); // TODO reset cache for updated Langium documents!

    constructor(typir: Typir) {
        this.typir = typir;
    }

    cacheSet(domainElement: unknown, type: Type): void {
        this.pendingClear(domainElement);
        this.cache.set(domainElement, type);
    }

    cacheGet(domainElement: unknown): Type | undefined {
        if (this.pendingGet(domainElement)) {
            return undefined;
        } else {
            return this.cache.get(domainElement);
        }
    }

    pendingSet(domainElement: unknown): void {
        this.cache.set(domainElement, undefined);
    }

    pendingClear(domainElement: unknown): void {
        if (this.cache.get(domainElement) !== undefined) {
            // do nothing
        } else {
            this.cache.delete(domainElement);
        }
    }

    pendingGet(domainElement: unknown): boolean {
        return this.cache.has(domainElement) && this.cache.get(domainElement) === undefined;
    }
}
