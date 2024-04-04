/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Kind } from '../kinds/kind.js';
import { TypeEdge } from './type-edge.js';

/**
 * Design decisions:
 * - features of types are realized/determined by their kinds
 */
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
