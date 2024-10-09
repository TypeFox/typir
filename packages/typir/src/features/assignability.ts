/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { isSpecificTypirProblem, TypirProblem } from '../utils/utils-definitions.js';

export interface AssignabilityProblem extends TypirProblem {
    $problem: 'AssignabilityProblem';
    source: Type;
    target: Type;
    subProblems: TypirProblem[];
}
export const AssignabilityProblem = 'AssignabilityProblem';
export function isAssignabilityProblem(problem: unknown): problem is AssignabilityProblem {
    return isSpecificTypirProblem(problem, AssignabilityProblem);
}

export interface TypeAssignability {
    // target := source;
    isAssignable(source: Type, target: Type): boolean;
    getAssignabilityProblem(source: Type, target: Type): AssignabilityProblem | undefined;
}

export class DefaultTypeAssignability implements TypeAssignability {
    protected readonly typir: Typir;

    constructor(typir: Typir) {
        this.typir = typir;
    }

    isAssignable(source: Type, target: Type): boolean {
        return this.getAssignabilityProblem(source, target) === undefined;
    }

    getAssignabilityProblem(source: Type, target: Type): AssignabilityProblem | undefined {
        // 1. are both types equal?
        if (this.typir.equality.areTypesEqual(source, target)) {
            return undefined;
        }

        // 2. implicit conversion from source to target possible?
        if (this.typir.conversion.isImplicitExplicitConvertible(source, target)) {
            return undefined;
        }

        // 3. is the source a sub-type of the target?
        const subTypeResult = this.typir.subtype.getSubTypeProblem(source, target);
        if (subTypeResult === undefined) {
            return undefined;
        } else {
            // return the found sub-type issues
            return {
                $problem: AssignabilityProblem,
                source,
                target,
                subProblems: [subTypeResult]
            };
        }
    }
}
