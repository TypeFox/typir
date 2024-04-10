/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeEdge } from './type-edge.js';
import { Type } from './type-node.js';

export class TypeGraph {
    protected readonly nodes: Map<string, Type> = new Map(); // type name => Type
    protected readonly edges: TypeEdge[] = [];

    addNode(type: Type): void {
        const key = type.name;
        if (this.nodes.has(key)) {
            if (this.nodes.get(key) === type) {
                // this type is already registered => that is OK
            } else {
                throw new Error(`Names of types must be unique: ${key}`);
            }
        } else {
            this.nodes.set(key, type);
        }
    }

    removeNode(type: Type): void {
        // remove all edges which are connected to the type to remove
        type.getAllIncomingEdges().forEach(e => this.removeEdge(e));
        type.getAllOutgoingEdges().forEach(e => this.removeEdge(e));
        // remove the type itself
        this.nodes.delete(type.name);
    }

    getNode(name: string): Type | undefined {
        return this.nodes.get(name);
    }
    getType(name: string): Type | undefined {
        return this.getNode(name);
    }

    addEdge(edge: TypeEdge): void {
        this.edges.push(edge);

        // register this new edge at the connected nodes
        edge.to.addIncomingEdge(edge);
        edge.from.addOutgoingEdge(edge);
    }

    removeEdge(edge: TypeEdge): void {
        const index = this.edges.indexOf(edge);
        if (index >= 0) {
            this.edges.splice(index, 1);
        }

        // remove this new edge at the connected nodes
        edge.to.removeIncomingEdge(edge);
        edge.from.removeOutgoingEdge(edge);
    }

    // add reusable graph algorithms here

}
