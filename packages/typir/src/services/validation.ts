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
import { toArray } from '../utils/utils.js';
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

export type ValidationRule<LanguageType = unknown, RootType = LanguageType> =
    | ValidationRuleStateless<LanguageType>
    | ValidationRuleWithBeforeAfter<LanguageType, RootType>;

type ClassifiedValidationRules<LanguageType = unknown, RootType = LanguageType> = {
    // Sets are used as data type in order to prevent duplicates by accidentally registering the same rule twice
    stateless: Set<ValidationRuleStateless<LanguageType>>;
    beforeAfter: Set<ValidationRuleWithBeforeAfter<LanguageType, RootType>>;
}

/**
 * Describes a simple, state-less validation rule,
 * which might produce an unlimited number of problems.
 */
export type ValidationRuleStateless<LanguageType = unknown> = (languageNode: LanguageType, typir: TypirServices) => ValidationProblem[];

/**
 * Describes a complex validation rule which has a state.
 * 'beforeValidation' can be used to set-up some data structures like a map,
 * in order to store some information which are calculated during 'validation',
 * which are finally evaluated in 'afterValidation'.
 */
export interface ValidationRuleWithBeforeAfter<LanguageType = unknown, RootType = LanguageType> {
    beforeValidation(languageRoot: RootType, typir: TypirServices): ValidationProblem[];
    validation: ValidationRuleStateless<LanguageType>;
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
            name:               this.printer.printTypeName(type),
        };
    }
}

export interface ValidationRuleOptions {
    /**
     * If a validation rule is associated with a language key, the validation rule will be executed only for language nodes, which have this language key,
     * in order to improve the runtime performance.
     * In case of multiple language keys, the validation rule will be applied to all language nodes having ones of these language keys.
     * Validation rules without a language key ('undefined') are executed for all language nodes.
     */
    languageKey: string | string[] | undefined;

    /**
     * An optional type, if the new validation rule is dedicated for exactly this type:
     * If the given type is removed from the type system, this rule will be automatically removed as well.
     * In case of 'undefined', the validation rule will never be automatically removed.
     */
    boundToType: Type | undefined;
}

export interface ValidationCollector<LanguageType = unknown, RootType = LanguageType> {
    validateBefore(languageNode: RootType): ValidationProblem[];
    validate(languageNode: LanguageType): ValidationProblem[];
    validateAfter(languageNode: RootType): ValidationProblem[];

    /**
     * Registers a validation rule.
     * @param rule a new validation rule
     * @param options some more options to control the handling of the added validation rule
     */
    addValidationRule(rule: ValidationRule<LanguageType, RootType>, options?: Partial<ValidationRuleOptions>): void;
    /**
     * Removes a validation rule.
     * @param rule the validation rule to remove
     * @param options the same options as given for the registration of the validation rule must be given for the removal!
     */
    removeValidationRule(rule: ValidationRule<LanguageType, RootType>, options?: Partial<ValidationRuleOptions>): void;
}

export class DefaultValidationCollector<LanguageType = unknown, RootType = LanguageType> implements ValidationCollector<LanguageType, RootType>, TypeGraphListener {
    protected readonly services: TypirServices;

    /**
     * language node type --> validation rules
     * Improves the look-up of related rules, when validating a concrete language node. */
    protected readonly languageTypeToRules: Map<string|undefined, ClassifiedValidationRules<LanguageType, RootType>> = new Map();
    /**
     * type identifier --> (language node type -> validation rules)
     * Improves the look-up for validation rules which are bound to types, when these types are removed. */
    protected readonly typirTypeToRules: Map<string, Map<string|undefined, ClassifiedValidationRules<LanguageType, RootType>>> = new Map();

    /** Remember these validation rules to find and execute them faster */
    protected readonly rulesBeforeAfter: Set<ValidationRuleWithBeforeAfter<LanguageType, RootType>> = new Set();

    constructor(services: TypirServices) {
        this.services = services;
        this.services.infrastructure.Graph.addListener(this);
    }

    validateBefore(languageRoot: RootType): ValidationProblem[] {
        const problems: ValidationProblem[] = [];
        for (const rule of this.rulesBeforeAfter) {
            problems.push(...rule.beforeValidation(languageRoot, this.services));
        }
        return problems;
    }

    validate(languageNode: LanguageType): ValidationProblem[] {
        const problems: ValidationProblem[] = [];
        // execute the rules which are associated to the key of the current language node
        const languageKey = this.services.Language.getLanguageNodeKey(languageNode);
        this.executeRulesForLanguageNode(this.languageTypeToRules.get(languageKey), languageNode, problems);
        // execute all rules which are associated to no language nodes at all (as a fall-back for such rules)
        if (languageKey !== undefined) {
            this.executeRulesForLanguageNode(this.languageTypeToRules.get(undefined), languageNode, problems);
        }
        return problems;
    }

    protected executeRulesForLanguageNode(relevantRules: ClassifiedValidationRules<LanguageType, RootType> | undefined, languageNode: LanguageType, problems: ValidationProblem[]): void {
        for (const ruleStateless of relevantRules?.stateless ?? []) {
            problems.push(...ruleStateless(languageNode, this.services));
        }
        for (const ruleBeforeAfter of relevantRules?.beforeAfter ?? []) {
            problems.push(...ruleBeforeAfter.validation(languageNode, this.services));
        }
    }

    validateAfter(languageRoot: RootType): ValidationProblem[] {
        const problems: ValidationProblem[] = [];
        for (const rule of this.rulesBeforeAfter) {
            problems.push(...rule.afterValidation(languageRoot, this.services));
        }
        return problems;
    }

    protected getValidationRuleOptions(options?: Partial<ValidationRuleOptions>): ValidationRuleOptions {
        return {
            // default values ...
            languageKey: undefined,
            boundToType: undefined,
            // ... overridden by the actual options:
            ...options,
        };
    }

    protected getLanguageKeys(options?: Partial<ValidationRuleOptions>): Array<string|undefined> {
        if (options === undefined || options.languageKey === undefined) {
            return [undefined];
        } else {
            return toArray(options.languageKey);
        }
    }

    addValidationRule(rule: ValidationRule<LanguageType, RootType>, givenOptions?: Partial<ValidationRuleOptions>): void {
        const options = this.getValidationRuleOptions(givenOptions);

        // register the validation rule with the key(s) of the language node
        for (const key of this.getLanguageKeys(options)) {
            this.registerRuleForLanguageKey(rule, key);
            // register the rule for all sub-keys as well
            if (key) {
                this.services.Language.getAllSubKeys(key)
                    .forEach(subKey => this.registerRuleForLanguageKey(rule, subKey));
            }
        }

        // register validation rules for easier access
        if (typeof rule === 'function') {
            // nothing special
        } else {
            this.rulesBeforeAfter.add(rule);
        }

        // register the validation rule to Typir types in order to easily remove them together with removed types
        if (options.boundToType) {
            const typeKey = this.getBoundToTypeKey(options.boundToType);
            let typirRules = this.typirTypeToRules.get(typeKey);
            if (!typirRules) {
                typirRules = new Map();
                this.typirTypeToRules.set(typeKey, typirRules);
            }
            for (const key of this.getLanguageKeys(options)) {
                let languageRules = typirRules.get(key);
                if (!languageRules) {
                    languageRules = {
                        stateless: new Set(),
                        beforeAfter: new Set(),
                    };
                    typirRules.set(key, languageRules);
                }
                if (typeof rule === 'function') {
                    languageRules.stateless.add(rule);
                } else {
                    languageRules.beforeAfter.add(rule);
                }
            }
        }
    }

    protected registerRuleForLanguageKey(rule: ValidationRule<LanguageType, RootType>, languageKey: string | undefined): void {
        let rules = this.languageTypeToRules.get(languageKey);
        if (!rules) {
            rules = {
                stateless: new Set(),
                beforeAfter: new Set(),
            };
            this.languageTypeToRules.set(languageKey, rules);
        }
        if (typeof rule === 'function') {
            rules.stateless.add(rule);
        } else {
            rules.beforeAfter.add(rule);
        }
    }

    removeValidationRule(rule: ValidationRule<LanguageType, RootType>, givenOptions?: Partial<ValidationRuleOptions>): void {
        const options = this.getValidationRuleOptions(givenOptions);

        for (const key of this.getLanguageKeys(options)) {
            this.deregisterRuleForLanguageKey(rule, key);
            // deregister the rule for all sub-keys as well
            if (key) {
                this.services.Language.getAllSubKeys(key)
                    .forEach(subKey => this.deregisterRuleForLanguageKey(rule, subKey));
            }
        }

        if (typeof rule === 'function') {
            // nothing special
        } else {
            this.rulesBeforeAfter.delete(rule);
        }

        if (options.boundToType) {
            const typeKey = this.getBoundToTypeKey(options.boundToType);
            const typirRules = this.typirTypeToRules.get(typeKey);
            if (typirRules) {
                for (const key of this.getLanguageKeys(options)) {
                    const languageRules = typirRules.get(key);
                    if (languageRules) {
                        if (typeof rule === 'function') {
                            languageRules.stateless.delete(rule);
                        } else {
                            languageRules.beforeAfter.delete(rule);
                        }
                    }
                }
            }
        }
    }

    protected deregisterRuleForLanguageKey(rule: ValidationRule<LanguageType, RootType>, languageKey: string | undefined): void {
        const rules = this.languageTypeToRules.get(languageKey);
        if (rules) {
            if (typeof rule === 'function') {
                rules.stateless.delete(rule);
            } else {
                rules.beforeAfter.delete(rule);
            }
        }
    }

    protected getBoundToTypeKey(boundToType?: Type): string {
        return boundToType?.getIdentifier() ?? '';
    }

    /* Get informed about deleted types in order to remove validation rules which are bound to them. */
    onRemovedType(type: Type, _key: string): void {
        const typeKey = this.getBoundToTypeKey(type);
        const entriesToRemove = this.typirTypeToRules.get(typeKey);
        this.typirTypeToRules.delete(typeKey);

        if (entriesToRemove) {
            for (const [languageKey, rules] of entriesToRemove.entries()) {
                const languageRules = this.languageTypeToRules.get(languageKey);
                if (languageRules) {
                    for (const ruleToRemove of rules.stateless) {
                        languageRules.stateless.delete(ruleToRemove);
                    }
                    for (const ruleToRemove of rules.beforeAfter) {
                        languageRules.beforeAfter.delete(ruleToRemove);
                        this.rulesBeforeAfter.delete(ruleToRemove);
                    }
                }
            }
        }
    }
}
