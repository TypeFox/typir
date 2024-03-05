/* eslint-disable header/header */

import { Kind } from '../kinds/kind';

export class TypeGraph {
    protected readonly nodes: Type[];
    protected readonly edges: TypeEdge[];

    addNode(type: Type): void {
        this.nodes.push(type);
    }

    addEdge(edge: TypeEdge): void {
        this.edges.push(edge);
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
    readonly meaning: string;
    readonly properties: Map<string, unknown> = new Map(); // store arbitrary data along edges

    constructor(from: Type, to: Type, meaning: string) {
        this.from = from;
        this.to = to;
        this.meaning = meaning;

        // register this new edge at the connected nodes
        this.to.addIncomingEdge(this);
        this.from.addOutgoingEdge(this);
    }
}

// or use graphology instead?
