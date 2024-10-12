/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type, isType } from '../graph/type-node.js';
import { TypirServices } from '../typir.js';
import { TypirProblem, isSpecificTypirProblem } from '../utils/utils-definitions.js';
import { TypeCheckStrategy, createTypeCheckStrategy } from '../utils/utils-type-comparison.js';
import { TypeInferenceCollector } from './inference.js';
import { ProblemPrinter } from './printing.js';

export type Severity = 'error' | 'warning' | 'info' | 'hint';

export interface ValidationMessageDetails {
    domainElement: unknown;
    domainProperty?: string; // name of a property of the domain element; TODO make this type-safe!
    domainIndex?: number; // index, if this property is an Array property
    severity: Severity;
    message: string;
}

export interface ValidationProblem extends ValidationMessageDetails, TypirProblem {
    $problem: 'ValidationProblem';
    subProblems?: TypirProblem[];
}
export const ValidationProblem = 'ValidationProblem';
export function isValidationProblem(problem: unknown): problem is ValidationProblem {
    return isSpecificTypirProblem(problem, ValidationProblem);
}

export type ValidationRule = (domainElement: unknown, typir: TypirServices) => ValidationProblem[];

export interface ValidationRuleWithBeforeAfter {
    beforeValidation(domainRoot: unknown, typir: TypirServices): ValidationProblem[]
    validation: ValidationRule
    afterValidation(domainRoot: unknown, typir: TypirServices): ValidationProblem[]
}

/** Annotate types after the validation with additional information in order to ease the creation of usefull messages. */
export interface AnnotatedTypeAfterValidation {
    type: Type;
    userRepresentation: string;
    name: string;
}
export type ValidationMessageProvider = (actual: AnnotatedTypeAfterValidation, expected: AnnotatedTypeAfterValidation) => Partial<ValidationMessageDetails>;

export interface ValidationConstraints {
    ensureNodeIsAssignable(sourceNode: unknown | undefined, expected: Type | undefined | unknown,
        message: ValidationMessageProvider): ValidationProblem[];
    ensureNodeIsEquals(sourceNode: unknown | undefined, expected: Type | undefined | unknown,
        message: ValidationMessageProvider): ValidationProblem[];
    ensureNodeHasNotType(sourceNode: unknown | undefined, notExpected: Type | undefined | unknown,
        message: ValidationMessageProvider): ValidationProblem[];

    ensureNodeRelatedWithType(domainNode: unknown | undefined, expected: Type | undefined | unknown, strategy: TypeCheckStrategy, negated: boolean,
        message: ValidationMessageProvider): ValidationProblem[];
}

export class DefaultValidationConstraints implements ValidationConstraints {
    protected readonly services: TypirServices;
    protected readonly inference: TypeInferenceCollector;
    protected readonly printer: ProblemPrinter;

    constructor(services: TypirServices) {
        this.services = services;
        this.inference = services.inference;
        this.printer = services.printer;
    }

    ensureNodeIsAssignable(sourceNode: unknown | undefined, expected: Type | undefined | unknown,
        message: ValidationMessageProvider): ValidationProblem[] {
        return this.ensureNodeRelatedWithType(sourceNode, expected, 'ASSIGNABLE_TYPE', false, message);
    }

    ensureNodeIsEquals(sourceNode: unknown | undefined, expected: Type | undefined | unknown,
        message: ValidationMessageProvider): ValidationProblem[] {
        return this.ensureNodeRelatedWithType(sourceNode, expected, 'EQUAL_TYPE', false, message);
    }

    ensureNodeHasNotType(sourceNode: unknown | undefined, notExpected: Type | undefined | unknown,
        message: ValidationMessageProvider): ValidationProblem[] {
        return this.ensureNodeRelatedWithType(sourceNode, notExpected, 'EQUAL_TYPE', true, message);
    }

    ensureNodeRelatedWithType(domainNode: unknown | undefined, expected: Type | undefined | unknown, strategy: TypeCheckStrategy, negated: boolean,
        message: ValidationMessageProvider): ValidationProblem[] {
        if (domainNode !== undefined && expected !== undefined) {
            const actualType = isType(domainNode) ? domainNode : this.inference.inferType(domainNode);
            const expectedType = isType(expected) ? expected : this.inference.inferType(expected);
            if (isType(actualType) && isType(expectedType)) {
                const strategyLogic = createTypeCheckStrategy(strategy, this.services);
                const comparisonResult = strategyLogic(actualType, expectedType);
                if (comparisonResult !== undefined) {
                    if (negated) {
                        // everything is fine
                    } else {
                        const details = message(this.annotateType(actualType), this.annotateType(expectedType));
                        return [{
                            $problem: ValidationProblem,
                            domainElement: details.domainElement ?? domainNode,
                            domainProperty: details.domainProperty,
                            domainIndex: details.domainIndex,
                            severity: details.severity ?? 'error',
                            message: details.message ?? `'${actualType.identifier}' is ${negated ? '' : 'not '}related to '${expectedType.identifier}' regarding ${strategy}.`,
                            subProblems: [comparisonResult]
                        }];
                    }
                } else {
                    if (negated) {
                        const details = message(this.annotateType(actualType), this.annotateType(expectedType));
                        return [{
                            $problem: ValidationProblem,
                            domainElement: details.domainElement ?? domainNode,
                            domainProperty: details.domainProperty,
                            domainIndex: details.domainIndex,
                            severity: details.severity ?? 'error',
                            message: details.message ?? `'${actualType.identifier}' is ${negated ? '' : 'not '}related to '${expectedType.identifier}' regarding ${strategy}.`,
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

    protected annotateType(type: Type): AnnotatedTypeAfterValidation {
        return {
            type,
            userRepresentation: this.printer.printTypeUserRepresentation(type),
            name: this.printer.printTypeName(type),
        };
    }
}


export interface ValidationCollector {
    validateBefore(domainRoot: unknown): ValidationProblem[];
    validate(domainElement: unknown): ValidationProblem[];
    validateAfter(domainRoot: unknown): ValidationProblem[];

    addValidationRules(...rules: ValidationRule[]): void;
    addValidationRulesWithBeforeAndAfter(...rules: ValidationRuleWithBeforeAfter[]): void;
}

export class DefaultValidationCollector implements ValidationCollector {
    protected readonly services: TypirServices;
    readonly validationRules: ValidationRule[] = [];
    readonly validationRulesBeforeAfter: ValidationRuleWithBeforeAfter[] = [];

    constructor(services: TypirServices) {
        this.services = services;
    }

    validateBefore(domainRoot: unknown): ValidationProblem[] {
        const problems: ValidationProblem[] = [];
        for (const rule of this.validationRulesBeforeAfter) {
            problems.push(...rule.beforeValidation(domainRoot, this.services));
        }
        return problems;
    }

    validate(domainElement: unknown): ValidationProblem[] {
        const problems: ValidationProblem[] = [];
        for (const rule of this.validationRules) {
            problems.push(...rule(domainElement, this.services));
        }
        for (const rule of this.validationRulesBeforeAfter) {
            problems.push(...rule.validation(domainElement, this.services));
        }
        return problems;
    }

    validateAfter(domainRoot: unknown): ValidationProblem[] {
        const problems: ValidationProblem[] = [];
        for (const rule of this.validationRulesBeforeAfter) {
            problems.push(...rule.afterValidation(domainRoot, this.services));
        }
        return problems;
    }

    addValidationRules(...rules: ValidationRule[]): void {
        this.validationRules.push(...rules);
    }

    addValidationRulesWithBeforeAndAfter(...rules: ValidationRuleWithBeforeAfter[]): void {
        this.validationRulesBeforeAfter.push(...rules);
    }
}
