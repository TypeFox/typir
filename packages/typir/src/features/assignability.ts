/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type, isType } from '../graph/type-node.js';
import { TypirServices } from '../typir.js';
import { TypirProblem } from '../utils/utils-definitions.js';
import { TypeConversion } from './conversion.js';
import { SubType } from './subtype.js';

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
    protected readonly conversion: TypeConversion;
    protected readonly subtype: SubType;

    constructor(typir: TypirServices) {
        this.conversion = typir.conversion;
        this.subtype = typir.subtype;
    }

    isAssignable(source: Type, target: Type): boolean {
        return this.getAssignabilityProblem(source, target) === undefined;
    }

    getAssignabilityProblem(source: Type, target: Type): AssignabilityProblem | undefined {
        // conversion possible?
        if (this.conversion.isConvertible(source, target, 'IMPLICIT')) {
            return undefined;
        }

        // allow the types kind to determine about sub-type relationships
        const subTypeResult = this.subtype.getSubTypeProblem(source, target);
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
