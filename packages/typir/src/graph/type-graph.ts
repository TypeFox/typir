/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { EdgeCachingInformation } from '../services/caching.js';
import { assertTrue, removeFromArray } from '../utils/utils.js';
import { TypeEdge } from './type-edge.js';
import { Type } from './type-node.js';

/**
 * Each Typir instance has one single type graph.
 * Each type exists only once and is stored inside this type graph.
 *
 * Edges with different meaning/purpose will exist in parallel inside the same graph,
 * otherwise nodes/types need to be duplicated or would be used in multiple graphs.
 * Graph algorithms will need to filter the required edges regarding $relation.
 */
export class TypeGraph {

    protected readonly nodes: Map<string, Type> = new Map(); // type name => Type
    protected readonly edges: TypeEdge[] = [];

    protected readonly listeners: TypeGraphListener[] = [];

    /**
     * Usually this method is called by kinds after creating a corresponding type.
     * Therefore it is usually not needed to call this method in an other context.
     * @param type the new type
     * @param key an optional key to register the type, since it is allowed to register the same type with different keys in the graph
     */
    addNode(type: Type, key?: string): void {
        if (!key) {
            assertTrue(type.isInStateOrLater('Identifiable')); // the key of the type must be available!
        }
        const mapKey = key ?? type.getIdentifier();
        if (this.nodes.has(mapKey)) {
            if (this.nodes.get(mapKey) === type) {
                // this type is already registered => that is OK
            } else {
                throw new Error(`There is already a type with the identifier '${mapKey}'.`);
            }
        } else {
            this.nodes.set(mapKey, type);
            this.listeners.forEach(listener => listener.onAddedType?.call(listener, type, mapKey));
        }
    }

    /**
     * When removing a type/node, all its edges (incoming and outgoing) are removed as well.
     * Design decision:
     * This is the central API call to remove a type from the type system in case that it is no longer valid/existing/needed.
     * It is not required to directly inform the kind of the removed type yourself, since the kind itself will take care of removed types.
     * @param typeToRemove the type to remove
     * @param key an optional key to register the type, since it is allowed to register the same type with different keys in the graph
     */
    removeNode(typeToRemove: Type, key?: string): void {
        const mapKey = key ?? typeToRemove.getIdentifier();
        // remove all edges which are connected to the type to remove
        typeToRemove.getAllIncomingEdges().forEach(e => this.removeEdge(e));
        typeToRemove.getAllOutgoingEdges().forEach(e => this.removeEdge(e));
        // remove the type itself
        const contained = this.nodes.delete(mapKey);
        if (contained) {
            this.listeners.slice().forEach(listener => listener.onRemovedType?.call(listener, typeToRemove, mapKey));
            typeToRemove.dispose();
        } else {
            throw new Error(`Type does not exist: ${mapKey}`);
        }
    }

    getNode(key: string): Type | undefined {
        return this.nodes.get(key);
    }
    getType(key: string): Type | undefined {
        return this.getNode(key);
    }

    getAllRegisteredTypes(): Type[] {
        return [...this.nodes.values()];
    }

    addEdge(edge: TypeEdge): void {
        // check constraints: no duplicated edges (same values for: from, to, $relation)
        if (edge.from.getOutgoingEdges(edge.$relation).some(e => e.to === edge.to)) {
            throw new Error(`There is already a '${edge.$relation}' edge from '${edge.from.getName()}' to '${edge.to.getName()}'.`);
        }
        // TODO what about the other direction for bidirectional edges? for now, the user has to ensure no duplicates here!

        this.edges.push(edge);

        // register this new edge at the connected nodes
        edge.to.addIncomingEdge(edge);
        edge.from.addOutgoingEdge(edge);

        this.listeners.forEach(listener => listener.onAddedEdge?.call(listener, edge));
    }

    removeEdge(edge: TypeEdge): void {
        // remove this new edge at the connected nodes
        edge.to.removeIncomingEdge(edge);
        edge.from.removeOutgoingEdge(edge);

        if (removeFromArray(edge, this.edges)) {
            this.listeners.forEach(listener => listener.onRemovedEdge?.call(listener, edge));
        } else {
            throw new Error(`Edge does not exist: ${edge.$relation}`);
        }
    }

    getUnidirectionalEdge<T extends TypeEdge>(from: Type, to: Type, $relation: T['$relation'], cachingMode: EdgeCachingInformation = 'LINK_EXISTS'): T | undefined {
        return from.getOutgoingEdges<T>($relation).find(edge => edge.to === to && edge.cachingInformation === cachingMode);
    }

    getBidirectionalEdge<T extends TypeEdge>(from: Type, to: Type, $relation: T['$relation'], cachingMode: EdgeCachingInformation = 'LINK_EXISTS'): T | undefined {
        // for bidirectional edges, check outgoing and incoming edges, since the graph contains only a single edge!
        return from.getEdges<T>($relation).find(edge => edge.to === to && edge.cachingInformation === cachingMode);
    }


    // register listeners for changed types/edges in the type graph

    addListener(listener: TypeGraphListener, options?: { callOnAddedForAllExisting: boolean }): void {
        this.listeners.push(listener);
        if (options?.callOnAddedForAllExisting && listener.onAddedType) {
            this.nodes.forEach((type, key) => listener.onAddedType!.call(listener, type, key));
        }
    }
    removeListener(listener: TypeGraphListener): void {
        removeFromArray(listener, this.listeners);
    }


    // add reusable graph algorithms here (or introduce a new service for graph algorithms which might be easier to customize/exchange)

}

export type TypeGraphListener = Partial<{
    onAddedType(type: Type, key: string): void;
    onRemovedType(type: Type, key: string): void;
    onAddedEdge(edge: TypeEdge): void;
    onRemovedEdge(edge: TypeEdge): void;
}>
