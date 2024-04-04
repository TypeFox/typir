/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeEdge } from './type-edge.js';
import { Type } from './type-node.js';

export class TypeGraph {
    protected readonly nodes: Type[] = [];
    protected readonly edges: TypeEdge[] = [];

    addNode(type: Type): void {
        this.nodes.push(type);
    }

    removeNode(type: Type): void {
        const index = this.nodes.indexOf(type);
        if (index >= 0) {
            this.nodes.splice(index, 1);
        }
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
