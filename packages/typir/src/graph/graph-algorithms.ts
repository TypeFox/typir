/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypirServices, TypirSpecifics } from '../typir.js';
import { assertUnreachable } from '../utils/utils.js';
import { RelationInformation, TypeEdge } from './type-edge.js';
import { TypeGraph } from './type-graph.js';
import { Type } from './type-node.js';

/**
 * Graph algorithms to do calculations on the type graph.
 * All algorithms are robust regarding cycles.
 */
export interface GraphAlgorithms {
    collectReachableTypes(from: Type, $relations: RelationInformation[], filterEdges?: (edgr: TypeEdge) => boolean): Set<Type>;
    existsEdgePath(from: Type, to: Type, $relations: RelationInformation[], filterEdges?: (edgr: TypeEdge) => boolean): boolean;
    getEdgePath(from: Type, to: Type, $relations: RelationInformation[], filterEdges?: (edgr: TypeEdge) => boolean): TypeEdge[];
}

export class DefaultGraphAlgorithms<Specifics extends TypirSpecifics> implements GraphAlgorithms {
    protected readonly graph: TypeGraph;

    constructor(services: TypirServices<Specifics>) {
        this.graph = services.infrastructure.Graph;
    }

    collectReachableTypes(from: Type, $relations: RelationInformation[], filterEdges?: (edgr: TypeEdge) => boolean): Set<Type> {
        const result: Set<Type> = new Set();
        const remainingToCheck: Type[] = [from];

        while (remainingToCheck.length > 0) {
            const current = remainingToCheck.pop()!;

            for (const $relation of $relations) { // check the $relations in the given order
                for (const { otherEnd } of this.calculateRelevantEdges($relation, current, filterEdges)) {
                    if (result.has(otherEnd)) {
                        // already checked
                    } else {
                        result.add(otherEnd); // this type is reachable
                        remainingToCheck.push(otherEnd); // check it for recursive conversions
                    }
                }
            }
        }

        return result;
    }

    existsEdgePath(from: Type, to: Type, $relations: RelationInformation[], filterEdges?: (edgr: TypeEdge) => boolean): boolean {
        const visited: Set<Type> = new Set();
        const stack: Type[] = [from];

        while (stack.length > 0) {
            const current = stack.pop()!;
            visited.add(current);

            for (const $relation of $relations) { // check the $relations in the given order
                for (const { otherEnd } of this.calculateRelevantEdges($relation, current, filterEdges)) {
                    if (otherEnd === to) {
                        /* It was possible to reach our goal type using this path.
                         * Base case that also catches the case in which start and end are the same
                         * (is there a cycle?). Therefore it is allowed to have been "visited".
                         * True will only be returned if there is a real path (cycle) made up of edges
                         */
                        return true;
                    }
                    if (!visited.has(otherEnd)) {
                        /* The target node of this edge has not been visited before and is also not our goal node
                         * Add it to the stack and investigate this path later.
                         */
                        stack.push(otherEnd);
                    }
                }
            }
        }

        // Fall through means that we could not reach the goal type
        return false;
    }

    getEdgePath(from: Type, to: Type, $relations: RelationInformation[], filterEdges?: (edgr: TypeEdge) => boolean): TypeEdge[] {
        const visited: Map<Type, TypeEdge|undefined> = new Map(); // the edge from the parent to the current node
        visited.set(from, undefined);
        const stack: Type[] = [from]; // stores the next types to investigate

        while (stack.length > 0) {
            const current = stack.pop()!;

            for (const $relation of $relations) { // check the $relations in the given order
                for (const { edge, myEnd, otherEnd } of this.calculateRelevantEdges($relation, current, filterEdges)) {
                    if (otherEnd === to) {
                        /* It was possible to reach our goal type using this path.
                         * Base case that also catches the case in which start and end are the same
                         * (is there a cycle?). Therefore it is allowed to have been "visited".
                         * True will only be returned if there is a real path (cycle) made up of edges
                         */
                        const result: TypeEdge[] = [edge];
                        // collect the path of used edges, from "to" back to "from"
                        let backNode = myEnd;
                        while (backNode !== from) {
                            const backEdge = visited.get(backNode)!;
                            result.unshift(backEdge);
                            backNode = backEdge.to === backNode ? backEdge.from : backEdge.to; // handle bidirectional edges defined for the "wrong" direction
                        }
                        return result;
                    }
                    if (!visited.has(otherEnd)) {
                        /* The target node of this edge has not been visited before and is also not our goal node
                         * Add it to the stack and investigate this path later.
                         */
                        stack.push(otherEnd);
                        visited.set(otherEnd, edge);
                    }
                }
            }
        }

        // Fall through means that we could not reach the goal type
        return [];
    }

    protected calculateRelevantEdges($relation: RelationInformation, current: Type, filterEdges?: (edgr: TypeEdge) => boolean): Array<{ edge: TypeEdge, myEnd: Type, otherEnd: Type }> {
        if ($relation.direction === 'Unidirectional') {
            return current.getOutgoingEdges($relation.$relation)
                .filter(e => e.cachingInformation === 'LINK_EXISTS' && (filterEdges === undefined || filterEdges(e)))
                .map(e => ({ edge: e, myEnd: e.from, otherEnd: e.to }));
        }
        if ($relation.direction === 'Bidirectional') {
            // for bidirectional edges, both outgoing and incoming edges need to be checked, while to and from are swapped
            return [
                ...current.getOutgoingEdges($relation.$relation)
                    .filter(e => e.cachingInformation === 'LINK_EXISTS' && (filterEdges === undefined || filterEdges(e)))
                    .map(e => ({ edge: e, myEnd: e.from, otherEnd: e.to })),
                ...current.getIncomingEdges($relation.$relation)
                    .filter(e => e.cachingInformation === 'LINK_EXISTS' && (filterEdges === undefined || filterEdges(e)))
                    .map(e => ({ edge: e, myEnd: e.to, otherEnd: e.from })),
            ];
        }
        assertUnreachable($relation.direction);
    }
}
