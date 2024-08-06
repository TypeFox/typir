/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type, isType } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { TypirProblem } from '../utils/utils-type-comparison.js';

export interface AssignabilityProblem {
    source: Type;
    target: Type;
    subProblems: TypirProblem[];
}
export function isAssignabilityProblem(problem: unknown): problem is AssignabilityProblem {
    return typeof problem === 'object' && problem !== null && isType((problem as AssignabilityProblem).source) && isType((problem as AssignabilityProblem).target);
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
        // conversion possible?
        if (this.typir.conversion.isConvertibleTo(source, target, 'IMPLICIT')) {
            return undefined;
        }

        // allow the types kind to determine about sub-type relationships
        const subTypeResult = this.typir.subtype.getSubTypeProblem(target, source);
        if (subTypeResult === undefined) {
            return undefined;
        } else {
            return {
                source,
                target,
                subProblems: [subTypeResult]
            };
        }
    }
}
