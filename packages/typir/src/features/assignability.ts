/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { isConcreteTypirProblem, TypirProblem } from '../utils/utils-definitions.js';

export interface AssignabilityProblem extends TypirProblem {
    $problem: 'AssignabilityProblem';
    source: Type;
    target: Type;
    subProblems: TypirProblem[];
}
export const AssignabilityProblem = 'AssignabilityProblem';
export function isAssignabilityProblem(problem: unknown): problem is AssignabilityProblem {
    return isConcreteTypirProblem(problem, AssignabilityProblem);
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
        if (this.typir.conversion.isConvertible(source, target, 'IMPLICIT')) {
            return undefined;
        }

        // allow the types kind to determine about sub-type relationships
        const subTypeResult = this.typir.subtype.getSubTypeProblem(source, target);
        if (subTypeResult === undefined) {
            return undefined;
        } else {
            return {
                $problem: AssignabilityProblem,
                source,
                target,
                subProblems: [subTypeResult]
            };
        }
    }
}
