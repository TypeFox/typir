/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type, isType } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { TypeComparisonStrategy, TypirProblem, createTypeComparisonStrategy } from '../utils/utils-type-comparison.js';

export interface ValidationProblem {
    domainElement: unknown;
    domainProperty?: string; // name of a property of the domain element; TODO make this type-safe!
    domainIndex?: number; // index, if this property is an Array property
    severity: 'error' | 'warning' | 'info' | 'hint';
    message: string;
    subProblems?: TypirProblem[];
}
export function isValidationProblem(problem: unknown): problem is ValidationProblem {
    return typeof problem === 'object' && problem !== null && typeof (problem as ValidationProblem).severity === 'string' && (problem as ValidationProblem).message !== undefined;
}

export type ValidationRule = (domainElement: unknown, typir: Typir) => ValidationProblem[];

export interface ValidationConstraints {
    ensureNodeIsAssignable(sourceNode: unknown | undefined, expected: Type | undefined | unknown, message: string, domainProperty?: string): ValidationProblem[];
    ensureNodeHasNotType(sourceNode: unknown | undefined, notExpected: Type | undefined | unknown, message: string, domainProperty?: string): ValidationProblem[];

    ensureNodeComparedWithType(domainNode: unknown | undefined, expected: Type | undefined | unknown, strategy: TypeComparisonStrategy, negated: boolean, message: string, domainProperty?: string): ValidationProblem[];
}

export class DefaultValidationConstraints implements ValidationConstraints {
    protected readonly typir: Typir;

    constructor(typir: Typir) {
        this.typir = typir;
    }

    ensureNodeIsAssignable(sourceNode: unknown | undefined, expected: Type | undefined | unknown, message: string, domainProperty?: string): ValidationProblem[] {
        return this.ensureNodeComparedWithType(sourceNode, expected, 'ASSIGNABLE_TYPE', false, message, domainProperty);
    }

    ensureNodeHasNotType(sourceNode: unknown | undefined, notExpected: Type | undefined | unknown, message: string, domainProperty?: string): ValidationProblem[] {
        return this.ensureNodeComparedWithType(sourceNode, notExpected, 'EQUAL_TYPE', true, message, domainProperty);
    }

    ensureNodeComparedWithType(domainNode: unknown | undefined, expected: Type | undefined | unknown, strategy: TypeComparisonStrategy, negated: boolean, message: string, domainProperty?: string): ValidationProblem[] {
        if (domainNode !== undefined && expected !== undefined) {
            const actualType = isType(domainNode) ? domainNode : this.typir.inference.inferType(domainNode);
            const expectedType = isType(expected) ? expected : this.typir.inference.inferType(expected);
            if (isType(actualType) && isType(expectedType)) {
                const comparisonResult = createTypeComparisonStrategy(strategy, this.typir)(actualType, expectedType);
                if (comparisonResult !== true) {
                    if (negated) {
                        // everything is fine
                    } else {
                        return [{
                            domainElement: domainNode,
                            domainProperty,
                            severity: 'error',
                            message,
                            subProblems: [comparisonResult]
                        }];
                    }
                } else {
                    if (negated) {
                        return [{
                            domainElement: domainNode,
                            domainProperty,
                            severity: 'error',
                            message,
                            subProblems: [] // no sub-problems are available!
                        }];
                    } else {
                        // everything is fine
                    }
                }
            } else {
                // ignore inference problems
            }
        }
        return [];
    }
}

export interface ValidationCollector {
    validate(domainElement: unknown): ValidationProblem[];
    addValidationRules(...rules: ValidationRule[]): void;
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
            problems.push(...rule(domainElement, this.typir));
        }
        return problems;
    }

    addValidationRules(...rules: ValidationRule[]): void {
        this.validationRules.push(...rules);
    }
}
