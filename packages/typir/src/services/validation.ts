/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type, isType } from '../graph/type-node.js';
import { TypirServices } from '../typir.js';
import { RuleOptions, RuleRegistry } from '../utils/rule-registration.js';
import { TypirProblem, isSpecificTypirProblem } from '../utils/utils-definitions.js';
import { TypeCheckStrategy, createTypeCheckStrategy } from '../utils/utils-type-comparison.js';
import { TypeInferenceCollector } from './inference.js';
import { ProblemPrinter } from './printing.js';

export type Severity = 'error' | 'warning' | 'info' | 'hint';

export interface ValidationMessageDetails<LanguageType = unknown> {
    languageNode: LanguageType;
    languageProperty?: string; // name of a property of the language node; TODO make this type-safe!
    languageIndex?: number; // index, if this property is an Array property
    severity: Severity;
    message: string;
}

export interface ValidationProblem<LanguageType = unknown> extends ValidationMessageDetails<LanguageType>, TypirProblem {
    $problem: 'ValidationProblem';
    subProblems?: TypirProblem[];
}
export const ValidationProblem = 'ValidationProblem';
export function isValidationProblem<LanguageType = unknown>(problem: unknown): problem is ValidationProblem<LanguageType> {
    return isSpecificTypirProblem(problem, ValidationProblem);
}

export type ValidationRule<LanguageType = unknown, InputType = LanguageType> =
    | ValidationRuleStateless<LanguageType, InputType>
    | ValidationRuleWithBeforeAfter<LanguageType, LanguageType, InputType>;

/**
 * Describes a simple, state-less validation rule,
 * which might produce an unlimited number of problems.
 */
export type ValidationRuleStateless<LanguageType = unknown, InputType = LanguageType> = (languageNode: InputType, typir: TypirServices<LanguageType>) => Array<ValidationProblem<LanguageType>>;

/**
 * Describes a complex validation rule which has a state.
 * 'beforeValidation' can be used to set-up some data structures like a map,
 * in order to store some information which are calculated during 'validation',
 * which are finally evaluated in 'afterValidation'.
 */
export interface ValidationRuleWithBeforeAfter<LanguageType = unknown, RootType extends LanguageType = LanguageType, InputType = LanguageType> {
    beforeValidation(languageRoot: RootType, typir: TypirServices<LanguageType>): Array<ValidationProblem<LanguageType>>;
    validation: ValidationRuleStateless<LanguageType, InputType>;
    afterValidation(languageRoot: RootType, typir: TypirServices<LanguageType>): Array<ValidationProblem<LanguageType>>;
}

/** Annotate types after the validation with additional information in order to ease the creation of usefull messages. */
export interface AnnotatedTypeAfterValidation {
    type: Type;
    userRepresentation: string;
    name: string;
}
export type ValidationMessageProvider<LanguageType = unknown> = (actual: AnnotatedTypeAfterValidation, expected: AnnotatedTypeAfterValidation) => Partial<ValidationMessageDetails<LanguageType>>;

export interface ValidationConstraints<LanguageType = unknown> {
    ensureNodeIsAssignable<S extends LanguageType, E extends LanguageType>(sourceNode: S | undefined, expected: Type | undefined | E,
        message: ValidationMessageProvider<LanguageType>): Array<ValidationProblem<LanguageType>>;
    ensureNodeIsEquals<S extends LanguageType, E extends LanguageType>(sourceNode: S | undefined, expected: Type | undefined | E,
        message: ValidationMessageProvider<LanguageType>): Array<ValidationProblem<LanguageType>>;
    ensureNodeHasNotType<S extends LanguageType, E extends LanguageType>(sourceNode: S | undefined, notExpected: Type | undefined | E,
        message: ValidationMessageProvider<LanguageType>): Array<ValidationProblem<LanguageType>>;

    ensureNodeRelatedWithType<S extends LanguageType, E extends LanguageType>(languageNode: S | undefined, expected: Type | undefined | E, strategy: TypeCheckStrategy, negated: boolean,
        message: ValidationMessageProvider<LanguageType>): Array<ValidationProblem<LanguageType>>;
}

export class DefaultValidationConstraints<LanguageType = unknown> implements ValidationConstraints<LanguageType> {
    protected readonly services: TypirServices<LanguageType>;
    protected readonly inference: TypeInferenceCollector<LanguageType>;
    protected readonly printer: ProblemPrinter<LanguageType>;

    constructor(services: TypirServices<LanguageType>) {
        this.services = services;
        this.inference = services.Inference;
        this.printer = services.Printer;
    }

    ensureNodeIsAssignable<S extends LanguageType, E extends LanguageType>(sourceNode: S | undefined, expected: Type | undefined | E,
        message: ValidationMessageProvider<LanguageType>): Array<ValidationProblem<LanguageType>> {
        return this.ensureNodeRelatedWithType(sourceNode, expected, 'ASSIGNABLE_TYPE', false, message);
    }

    ensureNodeIsEquals<S extends LanguageType, E extends LanguageType>(sourceNode: S | undefined, expected: Type | undefined | E,
        message: ValidationMessageProvider<LanguageType>): Array<ValidationProblem<LanguageType>> {
        return this.ensureNodeRelatedWithType(sourceNode, expected, 'EQUAL_TYPE', false, message);
    }

    ensureNodeHasNotType<S extends LanguageType, E extends LanguageType>(sourceNode: S | undefined, notExpected: Type | undefined | E,
        message: ValidationMessageProvider<LanguageType>): Array<ValidationProblem<LanguageType>> {
        return this.ensureNodeRelatedWithType(sourceNode, notExpected, 'EQUAL_TYPE', true, message);
    }

    ensureNodeRelatedWithType<S extends LanguageType, E extends LanguageType>(languageNode: S | undefined, expected: Type | undefined | E, strategy: TypeCheckStrategy, negated: boolean,
        message: ValidationMessageProvider<LanguageType>): Array<ValidationProblem<LanguageType>> {
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
            name:               this.printer.printTypeName(type),
        };
    }
}

export interface ValidationRuleOptions extends RuleOptions {
    // no additional properties so far
}

export interface ValidationCollector<LanguageType = unknown> {
    validateBefore(languageNode: LanguageType): Array<ValidationProblem<LanguageType>>;
    validate(languageNode: LanguageType): Array<ValidationProblem<LanguageType>>;
    validateAfter(languageNode: LanguageType): Array<ValidationProblem<LanguageType>>;

    /**
     * Registers a validation rule.
     * @param rule a new validation rule
     * @param options some more options to control the handling of the added validation rule
     */
    addValidationRule(rule: ValidationRule<LanguageType>, options?: Partial<ValidationRuleOptions>): void;
    /**
     * Removes a validation rule.
     * @param rule the validation rule to remove
     * @param options the same options as given for the registration of the validation rule must be given for the removal!
     */
    removeValidationRule(rule: ValidationRule<LanguageType>, options?: Partial<ValidationRuleOptions>): void;
}

export class DefaultValidationCollector<LanguageType = unknown> implements ValidationCollector<LanguageType> {
    protected readonly services: TypirServices<LanguageType>;

    protected readonly ruleRegistryStateLess: RuleRegistry<ValidationRuleStateless<LanguageType>>;
    protected readonly ruleRegistryBeforeAfter: RuleRegistry<ValidationRuleWithBeforeAfter<LanguageType>>;

    constructor(services: TypirServices<LanguageType>) {
        this.services = services;
        this.ruleRegistryStateLess = new RuleRegistry(services as TypirServices);
        this.ruleRegistryBeforeAfter = new RuleRegistry(services as TypirServices);
    }

    validateBefore(languageRoot: LanguageType): Array<ValidationProblem<LanguageType>> {
        const problems: Array<ValidationProblem<LanguageType>> = [];
        for (const rule of this.ruleRegistryBeforeAfter.getAllRules()) { // the returned rules are unique
            problems.push(...rule.beforeValidation.call(rule, languageRoot, this.services));
        }
        return problems;
    }

    validate(languageNode: LanguageType): Array<ValidationProblem<LanguageType>> {
        // determine all keys to check
        const keysToApply: Array<string|undefined> = [];
        const languageKey = this.services.Language.getLanguageNodeKey(languageNode);
        if (languageKey === undefined) {
            keysToApply.push(undefined);
        } else {
            keysToApply.push(languageKey); // execute the rules which are associated to the key of the current language node
            keysToApply.push(...this.services.Language.getAllSuperKeys(languageKey)); // apply all rules which are associated to super-keys
            keysToApply.push(undefined); // rules associated with 'undefined' are applied to all language nodes, apply these rules at the end
        }

        // execute all rules wich are associated to the relevant language keys
        const problems: Array<ValidationProblem<LanguageType>> = [];
        const alreadyExecutedRules: Set<ValidationRuleStateless<LanguageType>> = new Set(); // don't execute rules multiple times, if they are associated with multiple keys (with overlapping sub-keys)
        for (const key of keysToApply) {
            // state-less rules
            for (const ruleStateless of this.ruleRegistryStateLess.getRulesByLanguageKey(key)) {
                if (alreadyExecutedRules.has(ruleStateless)) {
                    // don't execute this rule again
                } else {
                    problems.push(...ruleStateless(languageNode, this.services));
                    alreadyExecutedRules.add(ruleStateless);
                }
            }

            // rules with before and after
            for (const ruleStateless of this.ruleRegistryBeforeAfter.getRulesByLanguageKey(key)) {
                if (alreadyExecutedRules.has(ruleStateless.validation)) {
                    // don't execute this rule again
                } else {
                    problems.push(...ruleStateless.validation.call(ruleStateless, languageNode, this.services));
                    alreadyExecutedRules.add(ruleStateless.validation);
                }
            }
        }
        return problems;
    }

    validateAfter(languageRoot: LanguageType): Array<ValidationProblem<LanguageType>> {
        const problems: Array<ValidationProblem<LanguageType>> = [];
        for (const rule of this.ruleRegistryBeforeAfter.getAllRules()) { // the returned rules are unique
            problems.push(...rule.afterValidation.call(rule, languageRoot, this.services));
        }
        return problems;
    }

    addValidationRule(rule: ValidationRule<LanguageType>, givenOptions?: Partial<ValidationRuleOptions>): void {
        if (typeof rule === 'function') {
            this.ruleRegistryStateLess.addRule(rule as ValidationRuleStateless<LanguageType>, givenOptions);
        } else {
            this.ruleRegistryBeforeAfter.addRule(rule as ValidationRuleWithBeforeAfter<LanguageType>, givenOptions);
        }
    }

    removeValidationRule(rule: ValidationRule<LanguageType>, givenOptions?: Partial<ValidationRuleOptions>): void {
        if (typeof rule === 'function') {
            this.ruleRegistryStateLess.removeRule(rule as ValidationRuleStateless<LanguageType>, givenOptions);
        } else {
            this.ruleRegistryBeforeAfter.removeRule(rule as ValidationRuleWithBeforeAfter<LanguageType>, givenOptions);
        }
    }

}
