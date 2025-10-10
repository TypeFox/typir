/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { GraphAlgorithms } from '../graph/graph-algorithms.js';
import { isTypeEdge, TypeEdge } from '../graph/type-edge.js';
import { TypeGraph } from '../graph/type-graph.js';
import { Type } from '../graph/type-node.js';
import { TypirSpecifics, TypirServices } from '../typir.js';
import { TypirProblem } from '../utils/utils-definitions.js';
import { removeFromArray } from '../utils/utils.js';

export interface SubTypeProblem extends TypirProblem {
    $problem: 'SubTypeProblem';
    $result: 'SubTypeResult';
    superType: Type;
    subType: Type;
    result: false;
    subProblems: TypirProblem[]; // might be empty
}
export const SubTypeProblem = 'SubTypeProblem';
export function isSubTypeProblem(problem: unknown): problem is SubTypeProblem {
    return isSubTypeResult(problem) && problem.result === false;
}

export interface SubTypeSuccess {
    $result: 'SubTypeResult';
    superType: Type;
    subType: Type;
    result: true;
    path: SubTypeEdge[];
}
export function isSubTypeSuccess(success: unknown): success is SubTypeSuccess {
    return isSubTypeResult(success) && success.result === true;
}

export type SubTypeResult = SubTypeSuccess | SubTypeProblem;
export const SubTypeResult = 'SubTypeResult';
export function isSubTypeResult(result: unknown): result is SubTypeResult {
    return typeof result === 'object' && result !== null && ((result as SubTypeResult).$result === SubTypeResult);
}


export interface MarkSubTypeOptions {
    /** If selected, it will be checked, whether cycles in sub-type relationships exists now at the involved types.
     * Types which internally manage their sub-type relationships themselves usually don't check for cycles,
     * since there might be already (other) cycles by user-defined types (e.g. classes with sub-super classes) and which are reported with dedicated validations.
     */
    checkForCycles: boolean;
}

/**
 * Analyzes, whether there is a sub type-relationship between two types.
 * The sub-type relationship might be direct or indirect (transitive).
 *
 * Two types which are same or equal, they are not considered as sub-types to each other (by definition).
 */
export interface SubType {
    isSubType(subType: Type, superType: Type): boolean;
    getSubTypeProblem(subType: Type, superType: Type): SubTypeProblem | undefined;
    getSubTypeResult(subType: Type, superType: Type): SubTypeResult;

    markAsSubType(subType: Type, superType: Type, options?: Partial<MarkSubTypeOptions>): void;
    unmarkAsSubType(subType: Type, superType: Type): void;

    addListener(listener: SubTypeListener, options?: { callOnMarkedForAllExisting: boolean }): void;
    removeListener(listener: SubTypeListener): void;
}

export interface SubTypeListener {
    onMarkedSubType(subType: Type, superType: Type, edge: SubTypeEdge): void;
    onUnmarkedSubType(subType: Type, superType: Type, edge: SubTypeEdge): void;
}


/**
 * The default implementation for the SubType service.
 * It assumes that all known types and all their sub-type relationships are explicitly encoded in the type graph.
 * Cycles in the sub-type relationships are supported,
 * so that DSL users might accidentally define e.g. classes with cyclic sub-super classes, resulting in validation errors shown to them.
 * This implementation does not cache any computed sub-type-relationships.
 */
export class DefaultSubType<Specifics extends TypirSpecifics> implements SubType {
    protected readonly graph: TypeGraph;
    protected readonly algorithms: GraphAlgorithms;
    protected readonly listeners: SubTypeListener[] = [];

    constructor(services: TypirServices<Specifics>) {
        this.graph = services.infrastructure.Graph;
        this.algorithms = services.infrastructure.GraphAlgorithms;
    }

    isSubType(subType: Type, superType: Type): boolean {
        return isSubTypeSuccess(this.getSubTypeResult(subType, superType));
    }

    getSubTypeProblem(subType: Type, superType: Type): SubTypeProblem | undefined {
        const result = this.getSubTypeResult(subType, superType);
        return isSubTypeProblem(result) ? result : undefined;
    }

    getSubTypeResult(subType: Type, superType: Type): SubTypeResult {
        // search for a transitive sub-type relationship
        const path = this.algorithms.getEdgePath(subType, superType, [{ $relation: SubTypeEdge, direction: 'Bidirectional' }]);
        if (path.length >= 1) {
            return <SubTypeSuccess>{
                $result: SubTypeResult,
                result: true,
                subType,
                superType,
                path, // return the found path
            };
        } else {
            return <SubTypeProblem>{
                $result: SubTypeResult,
                $problem: SubTypeProblem,
                result: false,
                subType,
                superType,
                subProblems: [], // TODO ?
            };
        }
    }

    protected getSubTypeEdge(from: Type, to: Type): SubTypeEdge | undefined {
        return from.getOutgoingEdges<SubTypeEdge>(SubTypeEdge).find(edge => edge.to === to);
    }

    protected collectMarkSubTypeOptions(options?: Partial<MarkSubTypeOptions>): MarkSubTypeOptions {
        return {
            // the default values:
            checkForCycles: true,
            // the actually overriden values:
            ...options
        };
    }

    markAsSubType(subType: Type, superType: Type, options: MarkSubTypeOptions): void {
        const actualOptions = this.collectMarkSubTypeOptions(options);
        let edge = this.getSubTypeEdge(subType, superType);
        let notify: boolean;
        if (edge) {
            notify = edge.cachingInformation !== 'LINK_EXISTS';
            edge.cachingInformation = 'LINK_EXISTS';
        } else {
            notify = true;
            edge = {
                $relation: SubTypeEdge,
                from: subType,
                to: superType,
                cachingInformation: 'LINK_EXISTS',
                error: undefined,
            };
            this.graph.addEdge(edge);
        }

        if (notify) {
            // check for cycles
            if (actualOptions.checkForCycles) {
                const hasIntroducedCycle = this.algorithms.existsEdgePath(subType, subType, [{ $relation: SubTypeEdge, direction: 'Unidirectional' }]);
                if (hasIntroducedCycle) {
                    throw new Error(`Adding the sub-type relationship from ${subType.getIdentifier()} to ${superType.getIdentifier()} has introduced a cycle in the type graph.`);
                }
            }

            this.listeners.slice().forEach(listener => listener.onMarkedSubType(subType, superType, edge));
        }
    }

    unmarkAsSubType(subType: Type, superType: Type): void {
        const edge = this.getSubTypeEdge(subType, superType);
        const notify = edge?.cachingInformation === 'LINK_EXISTS';
        if (edge) {
            this.graph.removeEdge(edge);
        }
        if (notify) {
            this.listeners.slice().forEach(listener => listener.onUnmarkedSubType(subType, superType, edge));
        }
    }

    addListener(listener: SubTypeListener, options?: { callOnMarkedForAllExisting: boolean; }): void {
        this.listeners.push(listener);
        if (options?.callOnMarkedForAllExisting) {
            this.graph.getEdges<SubTypeEdge>(SubTypeEdge).forEach(e => listener.onMarkedSubType(e.from, e.to, e));
        }
    }

    removeListener(listener: SubTypeListener): void {
        removeFromArray(listener, this.listeners);
    }

}

/**
 * Edges representing sub-type-relationships are directed and point from the sub type (start, from) to the super type (end, to).
 */
export interface SubTypeEdge extends TypeEdge {
    readonly $relation: 'SubTypeEdge';
    readonly error: SubTypeProblem | undefined;
}
export const SubTypeEdge = 'SubTypeEdge';

export function isSubTypeEdge(edge: unknown): edge is SubTypeEdge {
    return isTypeEdge(edge) && edge.$relation === SubTypeEdge;
}
