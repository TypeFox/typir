/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { EdgeCachingInformation } from '../features/caching.js';
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
     * Usually this method is called by kinds after creating a a corresponding type.
     * Therefore it is usually not needed to call this method in an other context.
     * @param type the new type
     */
    addNode(type: Type): void {
        const key = type.identifier;
        if (this.nodes.has(key)) {
            if (this.nodes.get(key) === type) {
                // this type is already registered => that is OK
            } else {
                throw new Error(`Names of types must be unique: ${key}`);
            }
        } else {
            this.nodes.set(key, type);
            this.listeners.forEach(listener => listener.addedType(type));
        }
    }

    /**
     * When removing a type/node, all its edges (incoming and outgoing) are removed as well.
     * Design decision:
     * This is the central API call to remove a type from the type system in case that it is no longer valid/existing/needed.
     * It is not required to directly inform the kind of the removed type yourself, since the kind itself will take care of removed types.
     * @param type the type to remove
     */
    removeNode(type: Type): void {
        const key = type.identifier;
        // remove all edges which are connected to the type to remove
        type.getAllIncomingEdges().forEach(e => this.removeEdge(e));
        type.getAllOutgoingEdges().forEach(e => this.removeEdge(e));
        // remove the type itself
        const contained = this.nodes.delete(key);
        if (contained) {
            this.listeners.forEach(listener => listener.removedType(type));
        } else {
            throw new Error(`Type does not exist: ${key}`);
        }
    }

    getNode(name: string): Type | undefined {
        return this.nodes.get(name);
    }
    getType(name: string): Type | undefined {
        return this.getNode(name);
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

        this.listeners.forEach(listener => listener.addedEdge(edge));
    }

    removeEdge(edge: TypeEdge): void {
        // remove this new edge at the connected nodes
        edge.to.removeIncomingEdge(edge);
        edge.from.removeOutgoingEdge(edge);

        const index = this.edges.indexOf(edge);
        if (index >= 0) {
            this.edges.splice(index, 1);
            this.listeners.forEach(listener => listener.removedEdge(edge));
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

    addListener(listener: TypeGraphListener): void {
        this.listeners.push(listener);
    }
    removeListener(listener: TypeGraphListener): void {
        const index = this.listeners.indexOf(listener);
        if (index >= 0) {
            this.listeners.splice(index, 1);
        }
    }


    // add reusable graph algorithms here (or introduce a new service for graph algorithms which might be easier to customize/exchange)

}

export interface TypeGraphListener {
    addedType(type: Type): void;
    removedType(type: Type): void;
    addedEdge(edge: TypeEdge): void;
    removedEdge(edge: TypeEdge): void;
}
