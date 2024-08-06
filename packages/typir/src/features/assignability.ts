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
    isAssignable(source: Type, target: Type): true | AssignabilityProblem; // target := source;
}

export class DefaultTypeAssignability implements TypeAssignability {
    protected readonly typir: Typir;

    constructor(typir: Typir) {
        this.typir = typir;
    }

    isAssignable(source: Type, target: Type): true | AssignabilityProblem {
        // conversion possible?
        if (this.typir.conversion.isConvertibleTo(source, target, 'IMPLICIT')) {
            return true;
        }

        // allow the types kind to determine about sub-type relationships
        const subTypeResult = this.typir.subtype.getSubTypeProblem(target, source);
        if (subTypeResult === undefined) {
            return true;
        } else {
            return {
                source,
                target,
                subProblems: [subTypeResult]
            };
        }
    }
}
