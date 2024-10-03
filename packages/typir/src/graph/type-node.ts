/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Kind, isKind } from '../kinds/kind.js';
import { TypirProblem } from '../utils/utils-definitions.js';
import { TypeEdge } from './type-edge.js';

/**
 * Design decisions:
 * - features of types are realized/determined by their kinds
 * - Names of types must be unique!
 */
export abstract class Type {
    readonly kind: Kind; // => $kind: string, required for isXType() checks
    /**
     * Identifiers must be unique and stable for all types known in a single Typir instance, since they are used as key to store types in maps.
     * Identifiers might have a naming schema for calculatable values.
     */
    /* Design decision for the name of this attribute
     * - identifier
     * - ID: sounds like an arbitrary, internal value without schema behind
     * - name: what is the name of a union type?
     */
    readonly identifier: string;

    // this is required only to apply graph algorithms in a generic way!
    // $relation is used as key
    protected readonly edgesIncoming: Map<string, TypeEdge[]> = new Map();
    protected readonly edgesOutgoing: Map<string, TypeEdge[]> = new Map();

    constructor(identifier: string) {
        this.identifier = identifier;
    }


    /**
     * Returns a string value containing a short representation of the type to be shown to users of the type-checked elements.
     * This value don't need to be unique for all types.
     * This name should be quite short.
     * Services should not call this function directly, but typir.printer.printTypeName(...) instead.
     * @returns a short string value to show to the user
     */
    abstract getName(): string;

    /**
     * Calculates a string value which might be shown to users of the type-checked elements.
     * This value don't need to be unique for all types.
     * This representation might be longer and show lots of details of the type.
     * Services should not call this function directly, but typir.printer.printTypeUserRepresentation(...) instead.
     * @returns a longer string value to show to the user
     */
    abstract getUserRepresentation(): string;


    /**
     * Analyzes, whether two types are equal.
     * @param otherType to be compared with the current type
     * @returns an empty array, if both types are equal, otherwise some problems which might point to found differences/conflicts between the two types.
     * These problems are presented to users in order to support them with useful information about the result of this analysis.
     */
    abstract analyzeTypeEqualityProblems(otherType: Type): TypirProblem[];

    /**
     * Analyzes, whether there is a sub type-relationship between two types.
     * The difference between sub type-relationships and super type-relationships are only switched types.
     * If both types are the same, no problems will be reported, since a type is considered as sub-type of itself (by definition).
     *
     * @param superType the super type, while the current type is the sub type
     * @returns an empty array, if the relationship exists, otherwise some problems which might point to violations of the investigated relationship.
     * These problems are presented to users in order to support them with useful information about the result of this analysis.
     */
    abstract analyzeIsSubTypeOf(superType: Type): TypirProblem[];

    /**
     * Analyzes, whether there is a super type-relationship between two types.
     * The difference between sub type-relationships and super type-relationships are only switched types.
     * If both types are the same, no problems will be reported, since a type is considered as sub-type of itself (by definition).
     *
     * @param subType the sub type, while the current type is super type
     * @returns an empty array, if the relationship exists, otherwise some problems which might point to violations of the investigated relationship.
     * These problems are presented to users in order to support them with useful information about the result of this analysis.
     */
    abstract analyzeIsSuperTypeOf(subType: Type): TypirProblem[];


    addIncomingEdge(edge: TypeEdge): void {
        const key = edge.$relation;
        if (this.edgesIncoming.has(key)) {
            this.edgesIncoming.get(key)!.push(edge);
        } else {
            this.edgesIncoming.set(key, [edge]);
        }
    }
    addOutgoingEdge(edge: TypeEdge): void {
        const key = edge.$relation;
        if (this.edgesOutgoing.has(key)) {
            this.edgesOutgoing.get(key)!.push(edge);
        } else {
            this.edgesOutgoing.set(key, [edge]);
        }
    }

    removeIncomingEdge(edge: TypeEdge): boolean {
        const key = edge.$relation;
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
        const key = edge.$relation;
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

    getIncomingEdges<T extends TypeEdge>($relation: T['$relation']): T[] {
        return this.edgesIncoming.get($relation) as T[] ?? [];
    }
    getOutgoingEdges<T extends TypeEdge>($relation: T['$relation']): T[] {
        return this.edgesOutgoing.get($relation) as T[] ?? [];
    }
    getEdges<T extends TypeEdge>($relation: T['$relation']): T[] {
        return [
            ...this.getIncomingEdges($relation),
            ...this.getOutgoingEdges($relation),
        ];
    }

    getAllIncomingEdges(): TypeEdge[] {
        return Array.from(this.edgesIncoming.values()).flat();
    }
    getAllOutgoingEdges(): TypeEdge[] {
        return Array.from(this.edgesOutgoing.values()).flat();
    }
    getAllEdges(): TypeEdge[] {
        return [
            ...this.getAllIncomingEdges(),
            ...this.getAllOutgoingEdges(),
        ];
    }
}

export function isType(type: unknown): type is Type {
    return typeof type === 'object' && type !== null && typeof (type as Type).identifier === 'string' && isKind((type as Type).kind);
}
