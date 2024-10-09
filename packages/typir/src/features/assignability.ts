/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type } from '../graph/type-node.js';
import { TypirServices } from '../typir.js';
import { isSpecificTypirProblem, TypirProblem } from '../utils/utils-definitions.js';
import { TypeConversion } from './conversion.js';
import { TypeEquality } from './equality.js';
import { SubType } from './subtype.js';

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
    protected readonly conversion: TypeConversion;
    protected readonly subtype: SubType;
    protected readonly equality: TypeEquality;

    constructor(services: TypirServices) {
        this.conversion = services.conversion;
        this.subtype = services.subtype;
        this.equality = services.equality;
    }

    isAssignable(source: Type, target: Type): boolean {
        return this.getAssignabilityProblem(source, target) === undefined;
    }

    getAssignabilityProblem(source: Type, target: Type): AssignabilityProblem | undefined {
        // 1. are both types equal?
        if (this.equality.areTypesEqual(source, target)) {
            return undefined;
        }

        // 2. implicit conversion from source to target possible?
        if (this.conversion.isImplicitExplicitConvertible(source, target)) {
            return undefined;
        }

        // 3. is the source a sub-type of the target?
        const subTypeResult = this.subtype.getSubTypeProblem(source, target);
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
