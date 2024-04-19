/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Typir } from '../typir.js';
import { TypirProblem } from '../utils/utils-type-comparison.js';

export interface ValidationProblem {
    domainElement: unknown;
    // TODO add fields for property, index, ... (similar to Langium)
    severity: 'error' | 'warning' | 'info' | 'hint';
    message: string;
    subProblems?: TypirProblem[];
}
export function isValidationProblem(problem: unknown): problem is ValidationProblem {
    return typeof problem === 'object' && problem !== null && typeof (problem as ValidationProblem).severity === 'string' && (problem as ValidationProblem).message !== undefined;
}

export interface ValidationRule {
    validate(domainElement: unknown): ValidationProblem[];
}

// TODO utility creation functions ?!

export interface ValidationCollector {
    validate(domainElement: unknown): ValidationProblem[];
    addValidationRule(rule: ValidationRule): void;
}

export class DefaultValidationCollector implements ValidationCollector {
    protected readonly typir: Typir;
    readonly validationRules: ValidationRule[] = [];

    constructor(typir: Typir) {
        this.typir = typir;
    }

    validate(domainElement: unknown): ValidationProblem[] {
        const problems: ValidationProblem[] = [];
        for (const rule of this.validationRules) {
            problems.push(...rule.validate(domainElement));
        }
        return problems;
    }

    addValidationRule(rule: ValidationRule): void {
        this.validationRules.push(rule);
    }
}
