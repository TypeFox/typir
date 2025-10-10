/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { GraphAlgorithms } from '../graph/graph-algorithms.js';
import { isTypeEdge, TypeEdge } from '../graph/type-edge.js';
import { TypeGraph } from '../graph/type-graph.js';
import { Type } from '../graph/type-node.js';
import { TypirServices, TypirSpecifics } from '../typir.js';
import { isSpecificTypirProblem, TypirProblem } from '../utils/utils-definitions.js';
import { removeFromArray } from '../utils/utils.js';

export interface TypeEqualityProblem extends TypirProblem {
    $problem: 'TypeEqualityProblem';
    type1: Type;
    type2: Type;
    subProblems: TypirProblem[]; // might be empty
}
export const TypeEqualityProblem = 'TypeEqualityProblem';
export function isTypeEqualityProblem(problem: unknown): problem is TypeEqualityProblem {
    return isSpecificTypirProblem(problem, TypeEqualityProblem);
}

/**
 * Analyzes, whether there is an equality-relationship between two types.
 *
 * In contrast to type comparisons with type1 === type2 or type1.identifier === type2.identifier,
 * equality will take alias types and so on into account as well.
 *
 * Equal types behave the same, but have multiple type nodes in the type graph.
 * Types which are equal need to be interrelated with an equality edge in the type graph.
 *
 * There is no dynamic calculation of equality on-demand, since that prevents searching for equality edges in the type graph (or makes it very inefficient).
 */
export interface TypeEquality {
    areTypesEqual(type1: Type, type2: Type): boolean;
    getTypeEqualityProblem(type1: Type, type2: Type): TypeEqualityProblem | undefined;

    /**
     * Establishes in the type system, that the given two types are equal.
     * @param type1 a type
     * @param type2 another type (the order of type1 and type2 does not matter)
     */
    markAsEqual(type1: Type, type2: Type): void;
    unmarkAsEqual(type1: Type, type2: Type): void;

    addListener(listener: TypeEqualityListener, options?: { callOnMarkedForAllExisting: boolean }): void;
    removeListener(listener: TypeEqualityListener): void;
}

export interface TypeEqualityListener {
    onMarkedEqual(type1: Type, type2: Type, edge: EqualityEdge): void;
    onUnmarkedEqual(type1: Type, type2: Type, edge: EqualityEdge): void;
}

export class DefaultTypeEquality<Specifics extends TypirSpecifics> implements TypeEquality {
    protected readonly graph: TypeGraph;
    protected readonly algorithms: GraphAlgorithms;
    protected readonly listeners: TypeEqualityListener[] = [];

    constructor(services: TypirServices<Specifics>) {
        this.graph = services.infrastructure.Graph;
        this.algorithms = services.infrastructure.GraphAlgorithms;
    }

    areTypesEqual(type1: Type, type2: Type): boolean {
        return this.getTypeEqualityProblem(type1, type2) === undefined;
    }

    getTypeEqualityProblem(type1: Type, type2: Type): TypeEqualityProblem | undefined {
        // same types are also equal
        if (type1 === type2) {
            return undefined;
        }
        if (type1.getIdentifier() === type2.getIdentifier()) { // this works, since identifiers are unique!
            return undefined;
        }

        // check whether the types are interrelated with equality edges in the type graph
        const path = this.algorithms.getEdgePath(type1, type2, [{ $relation: EqualityEdge, direction: 'Bidirectional' }]); // covers also transitive equality paths
        if (path.length >= 1) {
            return undefined;
        }

        // report non-equal types
        return {
            $problem: TypeEqualityProblem,
            type1,
            type2,
            subProblems: [] // TODO
        };
    }

    markAsEqual(type1: Type, type2: Type): void {
        let edge = this.getEqualityEdge(type1, type2);
        let notify: boolean;
        if (edge) {
            notify = edge.cachingInformation !== 'LINK_EXISTS';
            edge.cachingInformation = 'LINK_EXISTS';
        } else {
            notify = true;
            edge = {
                $relation: EqualityEdge,
                from: type1,
                to: type2,
                cachingInformation: 'LINK_EXISTS',
                error: undefined,
            };
            this.graph.addEdge(edge);
        }
        if (notify) {
            this.listeners.slice().forEach(listener => listener.onMarkedEqual(type1, type2, edge));
        }
    }

    unmarkAsEqual(type1: Type, type2: Type): void {
        const edge = this.getEqualityEdge(type1, type2);
        const notify = edge && edge.cachingInformation === 'LINK_EXISTS';
        if (edge) {
            this.graph.removeEdge(edge);
        }
        if (notify) {
            this.listeners.slice().forEach(listener => listener.onUnmarkedEqual(type1, type2, edge));
        }
    }

    protected getEqualityEdge(type1: Type, type2: Type): EqualityEdge | undefined {
        return this.graph.getBidirectionalEdge(type1, type2, EqualityEdge, 'LINK_EXISTS');
    }

    addListener(listener: TypeEqualityListener, options?: { callOnMarkedForAllExisting: boolean; }): void {
        this.listeners.push(listener);
        if (options?.callOnMarkedForAllExisting) {
            this.graph.getEdges<EqualityEdge>(EqualityEdge).forEach(e => listener.onMarkedEqual(e.from, e.to, e));
        }
    }

    removeListener(listener: TypeEqualityListener): void {
        removeFromArray(listener, this.listeners);
    }
}


/**
 * Describes, that the two connected types are equal.
 * Equality edges are bidirectional and might form cycles.
 */
export interface EqualityEdge extends TypeEdge {
    readonly $relation: 'EqualityEdge';
    readonly error: TypeEqualityProblem | undefined;
}
export const EqualityEdge = 'EqualityEdge';

export function isEqualityEdge(edge: unknown): edge is EqualityEdge {
    return isTypeEdge(edge) && edge.$relation === EqualityEdge;
}
