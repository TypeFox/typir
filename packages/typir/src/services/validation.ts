/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeGraphListener } from '../graph/type-graph.js';
import { Type, isType } from '../graph/type-node.js';
import { TypirServices } from '../typir.js';
import { TypirProblem, isSpecificTypirProblem } from '../utils/utils-definitions.js';
import { TypeCheckStrategy, createTypeCheckStrategy } from '../utils/utils-type-comparison.js';
import { TypeInferenceCollector } from './inference.js';
import { ProblemPrinter } from './printing.js';

export type Severity = 'error' | 'warning' | 'info' | 'hint';

export interface ValidationMessageDetails {
    languageNode: unknown;
    languageProperty?: string; // name of a property of the language node; TODO make this type-safe!
    languageIndex?: number; // index, if this property is an Array property
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

export type ValidationRule<T = unknown> = (languageNode: T, typir: TypirServices) => ValidationProblem[];

export interface ValidationRuleWithBeforeAfter<LanguageType = unknown, RootType = LanguageType> {
    beforeValidation(languageRoot: RootType, typir: TypirServices): ValidationProblem[];
    validation: ValidationRule<LanguageType>;
    afterValidation(languageRoot: RootType, typir: TypirServices): ValidationProblem[];
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

    ensureNodeRelatedWithType(languageNode: unknown | undefined, expected: Type | undefined | unknown, strategy: TypeCheckStrategy, negated: boolean,
        message: ValidationMessageProvider): ValidationProblem[];
}

export class DefaultValidationConstraints implements ValidationConstraints {
    protected readonly services: TypirServices;
    protected readonly inference: TypeInferenceCollector;
    protected readonly printer: ProblemPrinter;

    constructor(services: TypirServices) {
        this.services = services;
        this.inference = services.Inference;
        this.printer = services.Printer;
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

    ensureNodeRelatedWithType(languageNode: unknown | undefined, expected: Type | undefined | unknown, strategy: TypeCheckStrategy, negated: boolean,
        message: ValidationMessageProvider): ValidationProblem[] {
        if (languageNode !== undefined && expected !== undefined) {
            const actualType = isType(languageNode) ? languageNode : this.inference.inferType(languageNode);
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
                            languageNode: details.languageNode ?? languageNode,
                            languageProperty: details.languageProperty,
                            languageIndex: details.languageIndex,
                            severity: details.severity ?? 'error',
                            message: details.message ?? `'${actualType.getIdentifier()}' is ${negated ? '' : 'not '}related to '${expectedType.getIdentifier()}' regarding ${strategy}.`,
                            subProblems: [comparisonResult]
                        }];
                    }
                } else {
                    if (negated) {
                        const details = message(this.annotateType(actualType), this.annotateType(expectedType));
                        return [{
                            $problem: ValidationProblem,
                            languageNode: details.languageNode ?? languageNode,
                            languageProperty: details.languageProperty,
                            languageIndex: details.languageIndex,
                            severity: details.severity ?? 'error',
                            message: details.message ?? `'${actualType.getIdentifier()}' is ${negated ? '' : 'not '}related to '${expectedType.getIdentifier()}' regarding ${strategy}.`,
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


export interface ValidationCollector<LanguageType = unknown, RootType = LanguageType> {
    validateBefore(languageNode: RootType): ValidationProblem[];
    validate(languageNode: LanguageType): ValidationProblem[];
    validateAfter(languageNode: RootType): ValidationProblem[];

    /**
     * Registers a validation rule.
     * @param rule a new validation rule
     * @param boundToType an optional type, if the new validation rule is dedicated for exactly this type.
     * If the given type is removed from the type system, this rule will be automatically removed as well.
     */
    addValidationRule(rule: ValidationRule<LanguageType>, boundToType?: Type): void;
    removeValidationRule(rule: ValidationRule<LanguageType>, boundToType?: Type): void;

    /**
     * Registers a validation rule which will be called once before and once after the whole validation.
     * @param rule a new validation rule
     * @param boundToType an optional type, if the new validation rule is dedicated for exactly this type.
     * If the given type is removed from the type system, this rule will be automatically removed as well.
     */
    addValidationRuleWithBeforeAndAfter(rule: ValidationRuleWithBeforeAfter<LanguageType, RootType>, boundToType?: Type): void;
    removeValidationRuleWithBeforeAndAfter(rule: ValidationRuleWithBeforeAfter<LanguageType, RootType>, boundToType?: Type): void;
}

export class DefaultValidationCollector<LanguageType = unknown, RootType = LanguageType> implements ValidationCollector<LanguageType, RootType>, TypeGraphListener {
    protected readonly services: TypirServices;
    protected readonly validationRules: Map<string, Array<ValidationRule<LanguageType>>> = new Map(); // type identifier (otherwise '') -> validation rules
    protected readonly validationRulesBeforeAfter: Map<string, Array<ValidationRuleWithBeforeAfter<LanguageType, RootType>>> = new Map(); // type identifier (otherwise '') -> validation rules

    constructor(services: TypirServices) {
        this.services = services;
        this.services.infrastructure.Graph.addListener(this);
    }

    validateBefore(languageRoot: RootType): ValidationProblem[] {
        const problems: ValidationProblem[] = [];
        for (const rules of this.validationRulesBeforeAfter.values()) {
            for (const rule of rules) {
                problems.push(...rule.beforeValidation(languageRoot, this.services));
            }
        }
        return problems;
    }

    validate(languageNode: LanguageType): ValidationProblem[] {
        const problems: ValidationProblem[] = [];
        for (const rules of this.validationRules.values()) {
            for (const rule of rules) {
                problems.push(...rule(languageNode, this.services));
            }
        }
        for (const rules of this.validationRulesBeforeAfter.values()) {
            for (const rule of rules) {
                problems.push(...rule.validation(languageNode, this.services));
            }
        }
        return problems;
    }

    validateAfter(languageRoot: RootType): ValidationProblem[] {
        const problems: ValidationProblem[] = [];
        for (const rules of this.validationRulesBeforeAfter.values()) {
            for (const rule of rules) {
                problems.push(...rule.afterValidation(languageRoot, this.services));
            }
        }
        return problems;
    }

    addValidationRule(rule: ValidationRule<LanguageType>, boundToType?: Type): void {
        const key = this.getBoundToTypeKey(boundToType);
        let rules = this.validationRules.get(key);
        if (!rules) {
            rules = [];
            this.validationRules.set(key, rules);
        }
        rules.push(rule);
    }

    removeValidationRule(rule: ValidationRule<LanguageType>, boundToType?: Type): void {
        const key = this.getBoundToTypeKey(boundToType);
        const rules = this.validationRules.get(key);
        if (rules) {
            const index = rules.indexOf(rule);
            if (index >= 0) {
                rules.splice(index, 1);
            }
        }
    }

    addValidationRuleWithBeforeAndAfter(rule: ValidationRuleWithBeforeAfter<LanguageType, RootType>, boundToType?: Type): void {
        const key = this.getBoundToTypeKey(boundToType);
        let rules = this.validationRulesBeforeAfter.get(key);
        if (!rules) {
            rules = [];
            this.validationRulesBeforeAfter.set(key, rules);
        }
        rules.push(rule);
    }

    removeValidationRuleWithBeforeAndAfter(rule: ValidationRuleWithBeforeAfter<LanguageType, RootType>, boundToType?: Type): void {
        const key = this.getBoundToTypeKey(boundToType);
        const rules = this.validationRulesBeforeAfter.get(key);
        if (rules) {
            const index = rules.indexOf(rule);
            if (index >= 0) {
                rules.splice(index, 1);
            }
        }
    }

    protected getBoundToTypeKey(boundToType?: Type): string {
        return boundToType?.getIdentifier() ?? '';
    }

    /* Get informed about deleted types in order to remove validation rules which are bound to them. */
    onRemovedType(type: Type, _key: string): void {
        this.validationRules.delete(this.getBoundToTypeKey(type));
        this.validationRulesBeforeAfter.delete(this.getBoundToTypeKey(type));
    }
}
