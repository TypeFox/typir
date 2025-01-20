/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { GraphAlgorithms } from '../graph/graph-algorithms.js';
import { isTypeEdge, TypeEdge } from '../graph/type-edge.js';
import { TypeGraph } from '../graph/type-graph.js';
import { Type } from '../graph/type-node.js';
import { TypirServices } from '../typir.js';
import { TypirProblem } from '../utils/utils-definitions.js';
import { toArray } from '../utils/utils.js';

export interface SubTypeProblem extends TypirProblem {
    $problem: 'SubTypeProblem';
    $result: 'SubTypeResult';
    superType: Type;
    subType: Type;
    result: false;
    subProblems: TypirProblem[]; // might be empty
}
export const SubTypeProblem = 'SubTypeProblem';
export function isSubTypeProblem(result: unknown): result is SubTypeProblem {
    return isSubTypeResult(result) && result.result === false;
}

export interface SubTypeSuccess {
    $result: 'SubTypeResult';
    superType: Type;
    subType: Type;
    result: true;
    path: SubTypeEdge[];
}
export function isSubTypeSuccess(result: unknown): result is SubTypeSuccess {
    return isSubTypeResult(result) && result.result === true;
}

export type SubTypeResult = SubTypeSuccess | SubTypeProblem;
export const SubTypeResult = 'SubTypeResult';
export function isSubTypeResult(result: unknown): result is SubTypeResult {
    return typeof result === 'object' && result !== null && ((result as SubTypeResult).$result === SubTypeResult);
}


/**
 * Analyzes, whether there is a sub type-relationship between two types.
 *
 * The sub-type relationship might be direct or indirect (transitive).
 * If both types are the same, no problems will be reported, since a type is considered as sub-type of itself (by definition).
 *
 * In theory, the difference between sub type-relationships and super type-relationships are only switched types.
 * But in practise, the default implementation will ask both involved types (if they have different kinds),
 * whether there is a sub type-relationship respectively a super type-relationship.
 * If at least one type reports a relationship, a sub type-relationship is assumed.
 * This simplifies the implementation of TopTypes and the implementation of new types (or customization of existing types),
 * since unchanged types don't need to be customized to report sub type-relationships accordingly.
 */
export interface SubType {
    isSubType(subType: Type, superType: Type): boolean;
    /* TODO:
    - no problem ==> sub-type relationship exists
    - terminology: "no sub-type" is not a problem in general ("it is a qualified NO"), it is just a property! This is a general issue of the current design!
    */
    getSubTypeProblem(subType: Type, superType: Type): SubTypeProblem | undefined;
    getSubTypeResult(subType: Type, superType: Type): SubTypeResult;

    markAsSubType(subType: Type | Type[], superType: Type | Type[]): void;
}


/**
 * The default implementation for the SubType service.
 * This implementation does not cache any computed sub-type-relationships.
 */
export class DefaultSubType implements SubType {
    protected readonly graph: TypeGraph;
    protected readonly algorithms: GraphAlgorithms;

    constructor(services: TypirServices) {
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
        if (this.algorithms.existsEdgePath(subType, superType, [SubTypeEdge])) {
            return <SubTypeSuccess>{
                $result: SubTypeResult,
                result: true,
                subType,
                superType,
                path: [], // TODO insert the path here
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

    markAsSubType(subType: Type | Type[], superType: Type | Type[]): void {
        const allSub = toArray(subType);
        const allSuper = toArray(superType);
        for (const subT of allSub) {
            for (const superT of allSuper) {
                this.markAsSubTypeSingle(subT, superT);
            }
        }
    }

    protected markAsSubTypeSingle(subType: Type, superType: Type): void {
        let edge = this.getSubTypeEdge(subType, superType);
        if (!edge) {
            edge = {
                $relation: SubTypeEdge,
                from: subType,
                to: superType,
                cachingInformation: 'LINK_EXISTS',
                error: undefined,
            };
            this.graph.addEdge(edge);
        } else {
            edge.cachingInformation = 'LINK_EXISTS';
        }

        // TODO check for cycles!
    }
}

export interface SubTypeEdge extends TypeEdge {
    readonly $relation: 'SubTypeEdge';
    readonly error: SubTypeProblem | undefined;
}
export const SubTypeEdge = 'SubTypeEdge';

export function isSubTypeEdge(edge: unknown): edge is SubTypeEdge {
    return isTypeEdge(edge) && edge.$relation === SubTypeEdge;
}
