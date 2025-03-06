/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type, isType } from '../graph/type-node.js';
import { TypirServices } from '../typir.js';
import { RuleCollectorListener, RuleOptions, RuleRegistry } from '../utils/rule-registration.js';
import { TypirProblem, isSpecificTypirProblem } from '../utils/utils-definitions.js';
import { TypeCheckStrategy, createTypeCheckStrategy } from '../utils/utils-type-comparison.js';
import { removeFromArray, toArray } from '../utils/utils.js';
import { TypeInferenceCollector } from './inference.js';
import { ProblemPrinter } from './printing.js';

export type Severity = 'error' | 'warning' | 'info' | 'hint';

export interface ValidationMessageDetails<LanguageType = unknown, T extends LanguageType = LanguageType> {
    languageNode: T; // TODO review: in OX/LOX, 'unknown' instead of 'AstNode' is inferred by TypeScript, why?
    languageProperty?: string; // name of a property of the language node; TODO make this type-safe!
    languageIndex?: number; // index, if 'languageProperty' is an Array property
    severity: Severity;
    message: string;
}

export interface ValidationProblem<LanguageType = unknown, T extends LanguageType = LanguageType> extends ValidationMessageDetails<LanguageType, T>, TypirProblem {
    $problem: 'ValidationProblem';
    subProblems?: TypirProblem[];
}
export const ValidationProblem = 'ValidationProblem';
export function isValidationProblem<LanguageType = unknown, T extends LanguageType = LanguageType>(problem: unknown): problem is ValidationProblem<LanguageType, T> {
    return isSpecificTypirProblem(problem, ValidationProblem);
}

/** Don't specify the $problem-property. */
export type ReducedValidationProblem<LanguageType = unknown, T extends LanguageType = LanguageType> = Omit<ValidationProblem<LanguageType, T>, '$problem'>;

export type ValidationProblemAcceptor<LanguageType = unknown> = <T extends LanguageType = LanguageType>(problem: ReducedValidationProblem<LanguageType, T>) => void;

export type ValidationRule<LanguageType = unknown, InputType = LanguageType> =
    | ValidationRuleStateless<LanguageType, InputType>
    | ValidationRuleWithBeforeAfter<LanguageType, LanguageType, InputType>;

/**
 * Describes a simple, state-less validation rule,
 * which might produce an unlimited number of problems.
 */
export type ValidationRuleStateless<LanguageType = unknown, InputType = LanguageType> =
    (languageNode: InputType, accept: ValidationProblemAcceptor<LanguageType>, typir: TypirServices<LanguageType>) => void;

/**
 * Describes a complex validation rule which has a state.
 * 'beforeValidation' can be used to set-up some data structures like a map,
 * in order to store some information which are calculated during 'validation',
 * which are finally evaluated in 'afterValidation'.
 */
export interface ValidationRuleWithBeforeAfter<LanguageType = unknown, RootType extends LanguageType = LanguageType, InputType = LanguageType> {
    beforeValidation(languageRoot: RootType, accept: ValidationProblemAcceptor<LanguageType>, typir: TypirServices<LanguageType>): void;
    validation: ValidationRuleStateless<LanguageType, InputType>;
    afterValidation(languageRoot: RootType, accept: ValidationProblemAcceptor<LanguageType>, typir: TypirServices<LanguageType>): void;
}


/** Annotate types after the validation with additional information in order to ease the creation of usefull messages. */
export interface AnnotatedTypeAfterValidation {
    type: Type;
    userRepresentation: string;
    name: string;
}
export type ValidationMessageProvider<LanguageType = unknown, T extends LanguageType = LanguageType> =
    (actual: AnnotatedTypeAfterValidation, expected: AnnotatedTypeAfterValidation) => Partial<ValidationMessageDetails<LanguageType, T>>;

export interface ValidationConstraints<LanguageType = unknown> {
    ensureNodeIsAssignable<S extends LanguageType, E extends LanguageType, T extends LanguageType = LanguageType>(
        sourceNode: S | undefined, expected: Type | undefined | E,
        accept: ValidationProblemAcceptor<LanguageType>,
        message: ValidationMessageProvider<LanguageType, T>): void;
    ensureNodeIsEquals<S extends LanguageType, E extends LanguageType, T extends LanguageType = LanguageType>(
        sourceNode: S | undefined, expected: Type | undefined | E,
        accept: ValidationProblemAcceptor<LanguageType>,
        message: ValidationMessageProvider<LanguageType, T>): void;
    ensureNodeHasNotType<S extends LanguageType, E extends LanguageType, T extends LanguageType = LanguageType>(
        sourceNode: S | undefined, notExpected: Type | undefined | E,
        accept: ValidationProblemAcceptor<LanguageType>,
        message: ValidationMessageProvider<LanguageType, T>): void;

    ensureNodeRelatedWithType<S extends LanguageType, E extends LanguageType, T extends LanguageType = LanguageType>(
        languageNode: S | undefined, expected: Type | undefined | E, strategy: TypeCheckStrategy, negated: boolean,
        accept: ValidationProblemAcceptor<LanguageType>,
        message: ValidationMessageProvider<LanguageType, T>): void;
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

    ensureNodeIsAssignable<S extends LanguageType, E extends LanguageType, T extends LanguageType = LanguageType>(
        sourceNode: S | undefined, expected: Type | undefined | E,
        accept: ValidationProblemAcceptor<LanguageType>,
        message: ValidationMessageProvider<LanguageType, T>
    ): void {
        this.ensureNodeRelatedWithType(sourceNode, expected, 'ASSIGNABLE_TYPE', false, accept, message);
    }

    ensureNodeIsEquals<S extends LanguageType, E extends LanguageType, T extends LanguageType = LanguageType>(
        sourceNode: S | undefined, expected: Type | undefined | E,
        accept: ValidationProblemAcceptor<LanguageType>,
        message: ValidationMessageProvider<LanguageType, T>
    ): void {
        this.ensureNodeRelatedWithType(sourceNode, expected, 'EQUAL_TYPE', false, accept, message);
    }

    ensureNodeHasNotType<S extends LanguageType, E extends LanguageType, T extends LanguageType = LanguageType>(
        sourceNode: S | undefined, notExpected: Type | undefined | E,
        accept: ValidationProblemAcceptor<LanguageType>,
        message: ValidationMessageProvider<LanguageType, T>
    ): void {
        this.ensureNodeRelatedWithType(sourceNode, notExpected, 'EQUAL_TYPE', true, accept, message);
    }

    ensureNodeRelatedWithType<S extends LanguageType, E extends LanguageType, T extends LanguageType = LanguageType>(
        languageNode: S | undefined, expected: Type | undefined | E,
        strategy: TypeCheckStrategy, negated: boolean,
        accept: ValidationProblemAcceptor<LanguageType>,
        message: ValidationMessageProvider<LanguageType, T>
    ): void {
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
                        accept({
                            languageNode: details.languageNode ?? languageNode,
                            languageProperty: details.languageProperty,
                            languageIndex: details.languageIndex,
                            severity: details.severity ?? 'error',
                            message: details.message ?? `'${actualType.getIdentifier()}' is ${negated ? '' : 'not '}related to '${expectedType.getIdentifier()}' regarding ${strategy}.`,
                            subProblems: [comparisonResult]
                        });
                    }
                } else {
                    if (negated) {
                        const details = message(this.annotateType(actualType), this.annotateType(expectedType));
                        accept({
                            languageNode: details.languageNode ?? languageNode,
                            languageProperty: details.languageProperty,
                            languageIndex: details.languageIndex,
                            severity: details.severity ?? 'error',
                            message: details.message ?? `'${actualType.getIdentifier()}' is ${negated ? '' : 'not '}related to '${expectedType.getIdentifier()}' regarding ${strategy}.`,
                            subProblems: [] // no sub-problems are available!
                        });
                    } else {
                        // everything is fine
                    }
                }
            } else {
                // ignore inference problems
            }
        }
    }

    protected annotateType(type: Type): AnnotatedTypeAfterValidation {
        return {
            type,
            userRepresentation: this.printer.printTypeUserRepresentation(type),
            name:               this.printer.printTypeName(type),
        };
    }
}


export interface ValidationCollectorListener<LanguageType = unknown> {
    onAddedValidationRule(rule: ValidationRule<LanguageType>, options: ValidationRuleOptions): void;
    onRemovedValidationRule(rule: ValidationRule<LanguageType>, options: ValidationRuleOptions): void;
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

    addListener(listener: ValidationCollectorListener<LanguageType>): void;
    removeListener(listener: ValidationCollectorListener<LanguageType>): void;
}

export class DefaultValidationCollector<LanguageType = unknown> implements ValidationCollector<LanguageType>, RuleCollectorListener<ValidationRule<LanguageType>> {
    protected readonly services: TypirServices<LanguageType>;
    protected readonly listeners: Array<ValidationCollectorListener<LanguageType>> = [];

    protected readonly ruleRegistryStateLess: RuleRegistry<ValidationRuleStateless<LanguageType>, LanguageType>;
    protected readonly ruleRegistryBeforeAfter: RuleRegistry<ValidationRuleWithBeforeAfter<LanguageType>, LanguageType>;

    constructor(services: TypirServices<LanguageType>) {
        this.services = services;

        this.ruleRegistryStateLess = new RuleRegistry(services);
        this.ruleRegistryStateLess.addListener(this);

        this.ruleRegistryBeforeAfter = new RuleRegistry(services);
        this.ruleRegistryBeforeAfter.addListener(this);
    }

    protected createAcceptor(problems: Array<ValidationProblem<LanguageType>>): ValidationProblemAcceptor<LanguageType> {
        return <T extends LanguageType>(problem: ReducedValidationProblem<LanguageType, T>) => {
            problems.push({
                ...problem,
                $problem: ValidationProblem, // add the missing $property-property
            });
        };
    }

    validateBefore(languageRoot: LanguageType): Array<ValidationProblem<LanguageType>> {
        const problems: Array<ValidationProblem<LanguageType>> = [];
        const accept = this.createAcceptor(problems);
        for (const rule of this.ruleRegistryBeforeAfter.getUniqueRules()) { // the returned rules are unique
            rule.beforeValidation.call(rule, languageRoot, accept, this.services);
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
        const accept = this.createAcceptor(problems);
        const alreadyExecutedRules: Set<ValidationRuleStateless<LanguageType>> = new Set(); // don't execute rules multiple times, if they are associated with multiple keys (with overlapping sub-keys)
        for (const key of keysToApply) {
            // state-less rules
            for (const ruleStateless of this.ruleRegistryStateLess.getRulesByLanguageKey(key)) {
                if (alreadyExecutedRules.has(ruleStateless)) {
                    // don't execute this rule again
                } else {
                    ruleStateless(languageNode, accept, this.services);
                    alreadyExecutedRules.add(ruleStateless);
                }
            }

            // rules with before and after
            for (const ruleStateless of this.ruleRegistryBeforeAfter.getRulesByLanguageKey(key)) {
                if (alreadyExecutedRules.has(ruleStateless.validation)) {
                    // don't execute this rule again
                } else {
                    ruleStateless.validation.call(ruleStateless, languageNode, accept, this.services);
                    alreadyExecutedRules.add(ruleStateless.validation);
                }
            }
        }
        return problems;
    }

    validateAfter(languageRoot: LanguageType): Array<ValidationProblem<LanguageType>> {
        const problems: Array<ValidationProblem<LanguageType>> = [];
        const accept = this.createAcceptor(problems);
        for (const rule of this.ruleRegistryBeforeAfter.getUniqueRules()) { // the returned rules are unique
            rule.afterValidation.call(rule, languageRoot, accept, this.services);
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

    addListener(listener: ValidationCollectorListener<LanguageType>): void {
        this.listeners.push(listener);
    }
    removeListener(listener: ValidationCollectorListener<LanguageType>): void {
        removeFromArray(listener, this.listeners);
    }

    onAddedRule(rule: ValidationRule<LanguageType, LanguageType>, diffOptions: RuleOptions): void {
        // listeners of the composite will be notified about all added inner rules
        this.listeners.forEach(listener => listener.onAddedValidationRule(rule, diffOptions));
    }
    onRemovedRule(rule: ValidationRule<LanguageType, LanguageType>, diffOptions: RuleOptions): void {
        // listeners of the composite will be notified about all removed inner rules
        this.listeners.forEach(listener => listener.onRemovedValidationRule(rule, diffOptions));
    }
}


export class CompositeValidationRule<LanguageType = unknown> extends DefaultValidationCollector<LanguageType> implements ValidationRuleWithBeforeAfter<LanguageType> {
    /** The collector for inference rules, at which this composite rule should be registered. */
    protected readonly collectorToRegisterThisRule: ValidationCollector<LanguageType>;

    constructor(services: TypirServices<LanguageType>, collectorToRegisterThisRule: ValidationCollector<LanguageType>) {
        super(services);
        this.collectorToRegisterThisRule = collectorToRegisterThisRule;
    }

    beforeValidation(languageRoot: LanguageType, accept: ValidationProblemAcceptor<LanguageType>, _typir: TypirServices<LanguageType>): void {
        this.validateBefore(languageRoot).forEach(v => accept(v));
    }

    validation(languageNode: LanguageType, accept: ValidationProblemAcceptor<LanguageType>, _typir: TypirServices<LanguageType>): void {
        this.validate(languageNode).forEach(v => accept(v));
    }

    afterValidation(languageRoot: LanguageType, accept: ValidationProblemAcceptor<LanguageType>, _typir: TypirServices<LanguageType>): void {
        this.validateAfter(languageRoot).forEach(v => accept(v));
    }

    override onAddedRule(rule: ValidationRule<LanguageType, LanguageType>, diffOptions: RuleOptions): void {
        // an inner rule was added
        super.onAddedRule(rule, diffOptions);

        // this composite rule needs to be registered also for all the language keys of the new inner rule
        this.collectorToRegisterThisRule.addValidationRule(this, {
            ...diffOptions,
            boundToType: undefined,
        });
    }

    override onRemovedRule(rule: ValidationRule<LanguageType>, diffOptions: RuleOptions): void {
        // an inner rule was removed
        super.onRemovedRule(rule, diffOptions);

        // remove this composite rule for all language keys for which no inner rules are registered anymore
        if (diffOptions.languageKey === undefined) {
            if (this.ruleRegistryStateLess.getRulesByLanguageKey(undefined).length <= 0 && this.ruleRegistryBeforeAfter.getRulesByLanguageKey(undefined).length <= 0) {
                this.collectorToRegisterThisRule.removeValidationRule(this, {
                    ...diffOptions,
                    languageKey: undefined,
                    boundToType: undefined, // a composite rule is never bound to a type, since it manages this feature itself
                });
            }
        } else {
            const languageKeysToUnregister = toArray(diffOptions.languageKey)
                .filter(key => this.ruleRegistryStateLess.getRulesByLanguageKey(key).length <= 0 && this.ruleRegistryBeforeAfter.getRulesByLanguageKey(key).length <= 0);
            this.collectorToRegisterThisRule.removeValidationRule(this, {
                ...diffOptions,
                languageKey: languageKeysToUnregister,
                boundToType: undefined, // a composite rule is never bound to a type, since it manages this feature itself
            });
        }
    }
}
