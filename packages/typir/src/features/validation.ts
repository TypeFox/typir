/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type, isType } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { TypeCheckStrategy, TypirProblem, createTypeCheckStrategy } from '../utils/utils-type-comparison.js';

export type Severity = 'error' | 'warning' | 'info' | 'hint';
export interface ValidationProblem {
    domainElement: unknown;
    domainProperty?: string; // name of a property of the domain element; TODO make this type-safe!
    domainIndex?: number; // index, if this property is an Array property
    severity: Severity;
    message: string;
    subProblems?: TypirProblem[];
}
export function isValidationProblem(problem: unknown): problem is ValidationProblem {
    return typeof problem === 'object' && problem !== null && typeof (problem as ValidationProblem).severity === 'string' && (problem as ValidationProblem).message !== undefined;
}

export type ValidationRule = (domainElement: unknown, typir: Typir) => ValidationProblem[];

export interface ValidationConstraints {
    ensureNodeIsAssignable(sourceNode: unknown | undefined, expected: Type | undefined | unknown,
        message: string, domainProperty?: string|undefined, severity?: Severity|undefined): ValidationProblem[];
    ensureNodeIsEquals(sourceNode: unknown | undefined, expected: Type | undefined | unknown,
        message: string, domainProperty?: string|undefined, severity?: Severity): ValidationProblem[];
    ensureNodeHasNotType(sourceNode: unknown | undefined, notExpected: Type | undefined | unknown,
        message: string, domainProperty?: string|undefined, severity?: Severity): ValidationProblem[];

    ensureNodeRelatedWithType(domainNode: unknown | undefined, expected: Type | undefined | unknown, strategy: TypeCheckStrategy, negated: boolean, message: string, domainProperty?: string|undefined): ValidationProblem[];
}

export class DefaultValidationConstraints implements ValidationConstraints {
    protected readonly typir: Typir;

    constructor(typir: Typir) {
        this.typir = typir;
    }

    ensureNodeIsAssignable(sourceNode: unknown | undefined, expected: Type | undefined | unknown,
        message: string, domainProperty?: string|undefined, severity: Severity = 'error'): ValidationProblem[] {
        return this.ensureNodeRelatedWithType(sourceNode, expected, 'ASSIGNABLE_TYPE', false, message, domainProperty, severity);
    }

    ensureNodeIsEquals(sourceNode: unknown | undefined, expected: Type | undefined | unknown,
        message: string, domainProperty?: string|undefined, severity: Severity = 'error'): ValidationProblem[] {
        return this.ensureNodeRelatedWithType(sourceNode, expected, 'EQUAL_TYPE', false, message, domainProperty, severity);
    }

    ensureNodeHasNotType(sourceNode: unknown | undefined, notExpected: Type | undefined | unknown,
        message: string, domainProperty?: string|undefined, severity: Severity = 'error'): ValidationProblem[] {
        return this.ensureNodeRelatedWithType(sourceNode, notExpected, 'EQUAL_TYPE', true, message, domainProperty, severity);
    }

    ensureNodeRelatedWithType(domainNode: unknown | undefined, expected: Type | undefined | unknown, strategy: TypeCheckStrategy, negated: boolean,
        message: string, domainProperty?: string|undefined, severity: Severity = 'error'): ValidationProblem[] {
        if (domainNode !== undefined && expected !== undefined) {
            const actualType = isType(domainNode) ? domainNode : this.typir.inference.inferType(domainNode);
            const expectedType = isType(expected) ? expected : this.typir.inference.inferType(expected);
            if (isType(actualType) && isType(expectedType)) {
                const comparisonResult = createTypeCheckStrategy(strategy, this.typir)(actualType, expectedType);
                if (comparisonResult !== undefined) {
                    if (negated) {
                        // everything is fine
                    } else {
                        return [{
                            domainElement: domainNode,
                            domainProperty,
                            severity,
                            message,
                            subProblems: [comparisonResult]
                        }];
                    }
                } else {
                    if (negated) {
                        return [{
                            domainElement: domainNode,
                            domainProperty,
                            severity,
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
