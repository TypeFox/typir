/* eslint-disable header/header */

import { Kind } from '../kinds/kind';

export class TypeGraph {
    protected readonly nodes: Type[];
    protected readonly edges: TypeEdge[];

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

    // TODO add reusable graph algorithms here

}

export class Type {
    readonly kind: Kind;
    name: string;
    protected readonly edgesIncoming: Map<string, TypeEdge[]> = new Map();
    protected readonly edgesOutgoing: Map<string, TypeEdge[]> = new Map();

    constructor(kind: Kind, name: string) {
        this.kind = kind;
        this.name = name;
    }

    getUserRepresentation(): string {
        // features of types are realized by their kinds
        return this.kind.getUserRepresentation(this);
    }

    addIncomingEdge(edge: TypeEdge): void {
        const key = edge.meaning;
        if (this.edgesIncoming.has(key)) {
            this.edgesIncoming.get(key)?.push(edge);
        } else {
            this.edgesIncoming.set(key, [edge]);
        }
    }
    addOutgoingEdge(edge: TypeEdge): void {
        const key = edge.meaning;
        if (this.edgesOutgoing.has(key)) {
            this.edgesOutgoing.get(key)?.push(edge);
        } else {
            this.edgesOutgoing.set(key, [edge]);
        }
    }

    removeIncomingEdge(edge: TypeEdge): boolean {
        const key = edge.meaning;
        const list = this.edgesIncoming.get(key);
        if (list) {
            const index = list.indexOf(edge);
            if (index >= 0) {
                list.splice(index, 1);
                if (list.length <= 0) {
                    this.edgesIncoming.delete(key);
                }
                return true;
            }
        }
        return false;
    }
    removeOutgoingEdge(edge: TypeEdge): boolean {
        const key = edge.meaning;
        const list = this.edgesOutgoing.get(key);
        if (list) {
            const index = list.indexOf(edge);
            if (index >= 0) {
                list.splice(index, 1);
                if (list.length <= 0) {
                    this.edgesOutgoing.delete(key);
                }
                return true;
            }
        }
        return false;
    }

    getIncomingEdges(key: string): TypeEdge[] {
        return this.edgesIncoming.get(key) ?? [];
    }
    getOutgoingEdges(key: string): TypeEdge[] {
        return this.edgesOutgoing.get(key) ?? [];
    }
}

export class TypeEdge {
    readonly from: Type;
    readonly to: Type;
    readonly meaning: string; // unique keys to indicate the meaning of this edge
    readonly properties: Map<string, unknown> = new Map(); // store arbitrary data along edges

    constructor(from: Type, to: Type, meaning: string) {
        this.from = from;
        this.to = to;
        this.meaning = meaning;
    }
}
