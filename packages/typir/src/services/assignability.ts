/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { GraphAlgorithms } from '../graph/graph-algorithms.js';
import { Type } from '../graph/type-node.js';
import { TypirServices } from '../typir.js';
import { TypirProblem } from '../utils/utils-definitions.js';
import { ConversionEdge, isConversionEdge, TypeConversion } from './conversion.js';
import { TypeEquality } from './equality.js';
import { SubType, SubTypeEdge } from './subtype.js';

export interface AssignabilityProblem extends TypirProblem {
    $problem: 'AssignabilityProblem';
    $result: 'AssignabilityResult';
    source: Type;
    target: Type;
    result: false;
    subProblems: TypirProblem[];
}
export const AssignabilityProblem = 'AssignabilityProblem';
export function isAssignabilityProblem(problem: unknown): problem is AssignabilityProblem {
    return isAssignabilityResult(problem) && problem.result === false;
}

export interface AssignabilitySuccess {
    $result: 'AssignabilityResult';
    source: Type;
    target: Type;
    result: true;
    path: Array<SubTypeEdge | ConversionEdge>;
}
export function isAssignabilitySuccess(success: unknown): success is AssignabilitySuccess {
    return isAssignabilityResult(success) && success.result === true;
}

export type AssignabilityResult = AssignabilitySuccess | AssignabilityProblem;
export const AssignabilityResult = 'AssignabilityResult';
export function isAssignabilityResult(result: unknown): result is AssignabilityResult {
    return typeof result === 'object' && result !== null && ((result as AssignabilityResult).$result === AssignabilityResult);
}


export interface TypeAssignability {
    // target := source;
    isAssignable(source: Type, target: Type): boolean;
    getAssignabilityProblem(source: Type, target: Type): AssignabilityProblem | undefined;
    getAssignabilityResult(source: Type, target: Type): AssignabilityResult;
}


/**
 * This implementation for assignability checks step-by-step (1) equality, (2) implicit conversion, and (3) sub-type relationships of the source and target type.
 */
export class DefaultTypeAssignability<LanguageType> implements TypeAssignability {
    protected readonly conversion: TypeConversion;
    protected readonly subtype: SubType;
    protected readonly equality: TypeEquality;
    protected readonly algorithms: GraphAlgorithms;

    constructor(services: TypirServices<LanguageType>) {
        this.conversion = services.Conversion;
        this.subtype = services.Subtype;
        this.equality = services.Equality;
        this.algorithms = services.infrastructure.GraphAlgorithms;
    }

    isAssignable(source: Type, target: Type): boolean {
        return isAssignabilityProblem(this.getAssignabilityProblem(source, target)) === false;
    }

    getAssignabilityProblem(source: Type, target: Type): AssignabilityProblem | undefined {
        const result = this.getAssignabilityResult(source, target);
        return isAssignabilityProblem(result) ? result : undefined;
    }

    getAssignabilityResult(source: Type, target: Type): AssignabilityResult {
        // 1. are both types equal?
        if (this.equality.areTypesEqual(source, target)) {
            return <AssignabilitySuccess>{
                $result: AssignabilityResult,
                source,
                target,
                result: true,
                path: [],
            };
        }

        // 2. any path of implicit conversion and sub-type relationships
        const path = this.algorithms.getEdgePath(source, target, [ConversionEdge, SubTypeEdge],
            edge => isConversionEdge(edge) ? edge.mode === 'IMPLICIT_EXPLICIT' : true); // no explicit conversion
        if (path.length >= 1) {
            return <AssignabilitySuccess>{
                $result: AssignabilityResult,
                source,
                target,
                result: true,
                path, // report the found path in the graph
            };
        }

        // return the found sub-type issues
        return <AssignabilityProblem>{
            $problem: AssignabilityProblem,
            $result: AssignabilityResult,
            source,
            target,
            result: false,
            subProblems: [], // TODO
        };
    }
}
