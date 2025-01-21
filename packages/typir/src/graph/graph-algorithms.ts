/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypirServices } from '../typir.js';
import { TypeEdge } from './type-edge.js';
import { TypeGraph } from './type-graph.js';
import { Type } from './type-node.js';

/**
 * Graph algorithms to do calculations on the type graph.
 * All algorithms are robust regarding cycles.
 */
export interface GraphAlgorithms {
    collectReachableTypes(from: Type, $relations: Array<TypeEdge['$relation']>, filterEdges?: (edgr: TypeEdge) => boolean): Set<Type>;
    existsEdgePath(from: Type, to: Type, $relations: Array<TypeEdge['$relation']>, filterEdges?: (edgr: TypeEdge) => boolean): boolean;
    getEdgePath(from: Type, to: Type, $relations: Array<TypeEdge['$relation']>, filterEdges?: (edgr: TypeEdge) => boolean): TypeEdge[];
}

export class DefaultGraphAlgorithms implements GraphAlgorithms {
    protected readonly graph: TypeGraph;

    constructor(services: TypirServices) {
        this.graph = services.infrastructure.Graph;
    }

    collectReachableTypes(from: Type, $relations: Array<TypeEdge['$relation']>, filterEdges?: (edgr: TypeEdge) => boolean): Set<Type> {
        const result: Set<Type> = new Set();
        const remainingToCheck: Type[] = [from];

        while (remainingToCheck.length > 0) {
            const current = remainingToCheck.pop()!;
            const outgoingEdges = $relations.flatMap(r => current.getOutgoingEdges(r));
            for (const edge of outgoingEdges) {
                if (edge.cachingInformation === 'LINK_EXISTS' && (filterEdges === undefined || filterEdges(edge))) {
                    if (result.has(edge.to)) {
                        // already checked
                    } else {
                        result.add(edge.to); // this type is reachable
                        remainingToCheck.push(edge.to); // check it for recursive conversions
                    }
                }
            }
        }

        return result;
    }

    existsEdgePath(from: Type, to: Type, $relations: Array<TypeEdge['$relation']>, filterEdges?: (edgr: TypeEdge) => boolean): boolean {
        const visited: Set<Type> = new Set();
        const stack: Type[] = [from];

        while (stack.length > 0) {
            const current = stack.pop()!;
            visited.add(current);

            const outgoingEdges = $relations.flatMap(r => current.getOutgoingEdges(r));
            for (const edge of outgoingEdges) {
                if (edge.cachingInformation === 'LINK_EXISTS' && (filterEdges === undefined || filterEdges(edge))) {
                    if (edge.to === to) {
                        /* It was possible to reach our goal type using this path.
                         * Base case that also catches the case in which start and end are the same
                         * (is there a cycle?). Therefore it is allowed to have been "visited".
                         * True will only be returned if there is a real path (cycle) made up of edges
                         */
                        return true;
                    }
                    if (!visited.has(edge.to)) {
                        /* The target node of this edge has not been visited before and is also not our goal node
                         * Add it to the stack and investigate this path later.
                         */
                        stack.push(edge.to);
                    }
                }
            }
        }

        // Fall through means that we could not reach the goal type
        return false;
    }

    getEdgePath(from: Type, to: Type, $relations: Array<TypeEdge['$relation']>, filterEdges?: (edgr: TypeEdge) => boolean): TypeEdge[] {
        const visited: Map<Type, TypeEdge|undefined> = new Map(); // the edge from the parent to the current node
        visited.set(from, undefined);
        const stack: Type[] = [from];

        while (stack.length > 0) {
            const current = stack.pop()!;

            const outgoingEdges = $relations.flatMap(r => current.getOutgoingEdges(r));
            for (const edge of outgoingEdges) {
                if (edge.cachingInformation === 'LINK_EXISTS' && (filterEdges === undefined || filterEdges(edge))) {
                    if (edge.to === to) {
                        /* It was possible to reach our goal type using this path.
                         * Base case that also catches the case in which start and end are the same
                         * (is there a cycle?). Therefore it is allowed to have been "visited".
                         * True will only be returned if there is a real path (cycle) made up of edges
                         */
                        const result: TypeEdge[] = [edge];
                        // collect the path of used edges, from "to" back to "from"
                        let backNode = edge.from;
                        while (backNode !== from) {
                            const backEdge = visited.get(backNode)!;
                            result.unshift(backEdge);
                            backNode = backEdge.from;
                        }
                        return result;
                    }
                    if (!visited.has(edge.to)) {
                        /* The target node of this edge has not been visited before and is also not our goal node
                         * Add it to the stack and investigate this path later.
                         */
                        stack.push(edge.to);
                        visited.set(edge.to, edge);
                    }
                }
            }
        }

        // Fall through means that we could not reach the goal type
        return [];
    }

}
