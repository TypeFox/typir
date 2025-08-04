/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type, isType } from '../graph/type-node.js';
import { TypirSpecifics, TypirServices } from '../typir.js';
import { RuleCollectorListener, RuleOptions, RuleRegistry } from '../utils/rule-registration.js';
import { TypirProblem, isSpecificTypirProblem } from '../utils/utils-definitions.js';
import { TypeCheckStrategy, createTypeCheckStrategy } from '../utils/utils-type-comparison.js';
import { removeFromArray, toArray } from '../utils/utils.js';
import { TypeInferenceCollector } from './inference.js';
import { ProblemPrinter } from './printing.js';

export type Severity = 'error' | 'warning' | 'info' | 'hint';

export interface ValidationMessageDetails {
    severity: Severity;
    message: string;
    subProblems?: TypirProblem[];
}

export interface ValidationProblem<
    Specifics extends TypirSpecifics, T extends Specifics['LanguageType'] = Specifics['LanguageType']
> extends ValidationMessageDetails, TypirProblem {
    $problem: 'ValidationProblem';
    languageNode: T;
    languageProperty?: string; // name of a property of the language node; TODO make this type-safe!
    languageIndex?: number; // index, if 'languageProperty' is an Array property
}
export const ValidationProblem = 'ValidationProblem';
export function isValidationProblem<Specifics extends TypirSpecifics, T extends Specifics['LanguageType'] = Specifics['LanguageType']>(problem: unknown): problem is ValidationProblem<Specifics, T> {
    return isSpecificTypirProblem(problem, ValidationProblem);
}

/** Don't specify the $problem-property. */
export type ReducedValidationProblem<Specifics extends TypirSpecifics, T extends Specifics['LanguageType'] = Specifics['LanguageType']>
    = Omit<ValidationProblem<Specifics, T>, '$problem'>;

export type ValidationProblemAcceptor<Specifics extends TypirSpecifics>
    = <T extends Specifics['LanguageType'] = Specifics['LanguageType']>(problem: ReducedValidationProblem<Specifics, T>) => void;

export type ValidationRule<Specifics extends TypirSpecifics, InputType extends Specifics['LanguageType'] = Specifics['LanguageType']> =
    | ValidationRuleFunctional<Specifics, InputType>
    | ValidationRuleLifecycle<Specifics, Specifics['LanguageType'], InputType>;

/**
 * Describes a simple, state-less validation rule,
 * which might produce an unlimited number of problems.
 */
export type ValidationRuleFunctional<Specifics extends TypirSpecifics, InputType extends Specifics['LanguageType'] = Specifics['LanguageType']> =
    (languageNode: InputType, accept: ValidationProblemAcceptor<Specifics>, typir: TypirServices<Specifics>) => void;

/**
 * Describes a complex validation rule which has a state.
 * 'beforeValidation' can be used to set-up some data structures like a map,
 * in order to store some information which are calculated during 'validation',
 * which are finally evaluated in 'afterValidation'.
 */
export interface ValidationRuleLifecycle<
    Specifics extends TypirSpecifics,
    RootType extends Specifics['LanguageType'] = Specifics['LanguageType'],
    InputType extends Specifics['LanguageType'] = Specifics['LanguageType']
> {
    beforeValidation?: (languageRoot: RootType, accept: ValidationProblemAcceptor<Specifics>, typir: TypirServices<Specifics>) => void;
    validation: ValidationRuleFunctional<Specifics, InputType>;
    afterValidation?: (languageRoot: RootType, accept: ValidationProblemAcceptor<Specifics>, typir: TypirServices<Specifics>) => void;
}


/** Annotate types after the validation with additional information in order to ease the creation of usefull messages. */
export interface AnnotatedTypeAfterValidation {
    type: Type;
    userRepresentation: string;
    name: string;
}
export type ValidationMessageProvider<Specifics extends TypirSpecifics, T extends Specifics['LanguageType'] = Specifics['LanguageType']> =
    // Partial<...> enables to specificy only some of the mandatory properties, for the remaining ones, the service implementation provides values
    (actual: AnnotatedTypeAfterValidation, expected: AnnotatedTypeAfterValidation) => Partial<ReducedValidationProblem<Specifics, T>>;

export interface ValidationConstraints<Specifics extends TypirSpecifics> {
    ensureNodeIsAssignable<S extends Specifics['LanguageType'], E extends Specifics['LanguageType'], T extends Specifics['LanguageType'] = Specifics['LanguageType']>(
        sourceNode: S | undefined, expected: Type | undefined | E,
        accept: ValidationProblemAcceptor<Specifics>,
        message: ValidationMessageProvider<Specifics, T>): void;
    ensureNodeIsEquals<S extends Specifics['LanguageType'], E extends Specifics['LanguageType'], T extends Specifics['LanguageType'] = Specifics['LanguageType']>(
        sourceNode: S | undefined, expected: Type | undefined | E,
        accept: ValidationProblemAcceptor<Specifics>,
        message: ValidationMessageProvider<Specifics, T>): void;
    ensureNodeHasNotType<S extends Specifics['LanguageType'], E extends Specifics['LanguageType'], T extends Specifics['LanguageType'] = Specifics['LanguageType']>(
        sourceNode: S | undefined, notExpected: Type | undefined | E,
        accept: ValidationProblemAcceptor<Specifics>,
        message: ValidationMessageProvider<Specifics, T>): void;

    ensureNodeRelatedWithType<S extends Specifics['LanguageType'], E extends Specifics['LanguageType'], T extends Specifics['LanguageType'] = Specifics['LanguageType']>(
        languageNode: S | undefined, expected: Type | undefined | E, strategy: TypeCheckStrategy, negated: boolean,
        accept: ValidationProblemAcceptor<Specifics>,
        message: ValidationMessageProvider<Specifics, T>): void;
}

export class DefaultValidationConstraints<Specifics extends TypirSpecifics> implements ValidationConstraints<Specifics> {
    protected readonly services: TypirServices<Specifics>;
    protected readonly inference: TypeInferenceCollector<Specifics>;
    protected readonly printer: ProblemPrinter<Specifics>;

    constructor(services: TypirServices<Specifics>) {
        this.services = services;
        this.inference = services.Inference;
        this.printer = services.Printer;
    }

    ensureNodeIsAssignable<S extends Specifics['LanguageType'], E extends Specifics['LanguageType'], T extends Specifics['LanguageType'] = Specifics['LanguageType']>(
        sourceNode: S | undefined, expected: Type | undefined | E,
        accept: ValidationProblemAcceptor<Specifics>,
        message: ValidationMessageProvider<Specifics, T>
    ): void {
        this.ensureNodeRelatedWithType(sourceNode, expected, 'ASSIGNABLE_TYPE', false, accept, message);
    }

    ensureNodeIsEquals<S extends Specifics['LanguageType'], E extends Specifics['LanguageType'], T extends Specifics['LanguageType'] = Specifics['LanguageType']>(
        sourceNode: S | undefined, expected: Type | undefined | E,
        accept: ValidationProblemAcceptor<Specifics>,
        message: ValidationMessageProvider<Specifics, T>
    ): void {
        this.ensureNodeRelatedWithType(sourceNode, expected, 'EQUAL_TYPE', false, accept, message);
    }

    ensureNodeHasNotType<S extends Specifics['LanguageType'], E extends Specifics['LanguageType'], T extends Specifics['LanguageType'] = Specifics['LanguageType']>(
        sourceNode: S | undefined, notExpected: Type | undefined | E,
        accept: ValidationProblemAcceptor<Specifics>,
        message: ValidationMessageProvider<Specifics, T>
    ): void {
        this.ensureNodeRelatedWithType(sourceNode, notExpected, 'EQUAL_TYPE', true, accept, message);
    }

    ensureNodeRelatedWithType<S extends Specifics['LanguageType'], E extends Specifics['LanguageType'], T extends Specifics['LanguageType'] = Specifics['LanguageType']>(
        languageNode: S | undefined, expected: Type | undefined | E,
        strategy: TypeCheckStrategy, negated: boolean,
        accept: ValidationProblemAcceptor<Specifics>,
        message: ValidationMessageProvider<Specifics, T>
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


export interface ValidationCollectorListener<Specifics extends TypirSpecifics> {
    onAddedValidationRule(rule: ValidationRule<Specifics>, options: ValidationRuleOptions): void;
    onRemovedValidationRule(rule: ValidationRule<Specifics>, options: ValidationRuleOptions): void;
}

export interface ValidationRuleOptions extends RuleOptions {
    // no additional properties so far
}

export interface ValidationCollector<Specifics extends TypirSpecifics> {
    validateBefore(languageNode: Specifics['LanguageType']): Array<ValidationProblem<Specifics>>;
    validate(languageNode: Specifics['LanguageType']): Array<ValidationProblem<Specifics>>;
    validateAfter(languageNode: Specifics['LanguageType']): Array<ValidationProblem<Specifics>>;

    /**
     * Registers a validation rule.
     * @param rule a new validation rule
     * @param options some more options to control the handling of the added validation rule
     */
    addValidationRule<InputType extends Specifics['LanguageType'] = Specifics['LanguageType']>(rule: ValidationRule<Specifics, InputType>, options?: Partial<ValidationRuleOptions>): void;
    /**
     * Removes a validation rule.
     * @param rule the validation rule to remove
     * @param options the same options as given for the registration of the validation rule must be given for the removal!
     */
    removeValidationRule<InputType extends Specifics['LanguageType'] = Specifics['LanguageType']>(rule: ValidationRule<Specifics, InputType>, options?: Partial<ValidationRuleOptions>): void;

    addListener(listener: ValidationCollectorListener<Specifics>): void;
    removeListener(listener: ValidationCollectorListener<Specifics>): void;
}

export class DefaultValidationCollector<Specifics extends TypirSpecifics> implements ValidationCollector<Specifics>, RuleCollectorListener<ValidationRule<Specifics>> {
    protected readonly services: TypirServices<Specifics>;
    protected readonly listeners: Array<ValidationCollectorListener<Specifics>> = [];

    protected readonly ruleRegistryFunctional: RuleRegistry<ValidationRuleFunctional<Specifics>, Specifics>;
    protected readonly ruleRegistryLifecycle: RuleRegistry<ValidationRuleLifecycle<Specifics>, Specifics>;

    constructor(services: TypirServices<Specifics>) {
        this.services = services;

        this.ruleRegistryFunctional = new RuleRegistry(services);
        this.ruleRegistryFunctional.addListener(this);

        this.ruleRegistryLifecycle = new RuleRegistry(services);
        this.ruleRegistryLifecycle.addListener(this);
    }

    protected createAcceptor(problems: Array<ValidationProblem<Specifics>>): ValidationProblemAcceptor<Specifics> {
        return <T extends Specifics['LanguageType']>(problem: ReducedValidationProblem<Specifics, T>) => {
            problems.push({
                ...problem,
                $problem: ValidationProblem, // add the missing $property-property
            });
        };
    }

    validateBefore(languageRoot: Specifics['LanguageType']): Array<ValidationProblem<Specifics>> {
        const problems: Array<ValidationProblem<Specifics>> = [];
        const accept = this.createAcceptor(problems);
        for (const rule of this.ruleRegistryLifecycle.getUniqueRules()) { // the returned rules are unique
            rule.beforeValidation?.call(rule, languageRoot, accept, this.services);
        }
        return problems;
    }

    validate(languageNode: Specifics['LanguageType']): Array<ValidationProblem<Specifics>> {
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
        const problems: Array<ValidationProblem<Specifics>> = [];
        const accept = this.createAcceptor(problems);
        const alreadyExecutedRules: Set<ValidationRuleFunctional<Specifics>> = new Set(); // don't execute rules multiple times, if they are associated with multiple keys (with overlapping sub-keys)
        for (const key of keysToApply) {
            // state-less rules
            for (const ruleStateless of this.ruleRegistryFunctional.getRulesByLanguageKey(key)) {
                if (alreadyExecutedRules.has(ruleStateless)) {
                    // don't execute this rule again
                } else {
                    ruleStateless(languageNode, accept, this.services);
                    alreadyExecutedRules.add(ruleStateless);
                }
            }

            // rules with before and after
            for (const ruleStateless of this.ruleRegistryLifecycle.getRulesByLanguageKey(key)) {
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

    validateAfter(languageRoot: Specifics['LanguageType']): Array<ValidationProblem<Specifics>> {
        const problems: Array<ValidationProblem<Specifics>> = [];
        const accept = this.createAcceptor(problems);
        for (const rule of this.ruleRegistryLifecycle.getUniqueRules()) { // the returned rules are unique
            rule.afterValidation?.call(rule, languageRoot, accept, this.services);
        }
        return problems;
    }

    addValidationRule<InputType extends Specifics['LanguageType'] = Specifics['LanguageType']>(rule: ValidationRule<Specifics, InputType>, givenOptions?: Partial<ValidationRuleOptions>): void {
        if (typeof rule === 'function') {
            this.ruleRegistryFunctional.addRule(rule as ValidationRuleFunctional<Specifics>, givenOptions);
        } else {
            this.ruleRegistryLifecycle.addRule(rule as ValidationRuleLifecycle<Specifics>, givenOptions);
        }
    }

    removeValidationRule<InputType extends Specifics['LanguageType'] = Specifics['LanguageType']>(rule: ValidationRule<Specifics, InputType>, givenOptions?: Partial<ValidationRuleOptions>): void {
        if (typeof rule === 'function') {
            this.ruleRegistryFunctional.removeRule(rule as ValidationRuleFunctional<Specifics>, givenOptions);
        } else {
            this.ruleRegistryLifecycle.removeRule(rule as ValidationRuleLifecycle<Specifics>, givenOptions);
        }
    }

    addListener(listener: ValidationCollectorListener<Specifics>): void {
        this.listeners.push(listener);
    }
    removeListener(listener: ValidationCollectorListener<Specifics>): void {
        removeFromArray(listener, this.listeners);
    }

    onAddedRule(rule: ValidationRule<Specifics>, diffOptions: RuleOptions): void {
        // listeners of the composite will be notified about all added inner rules
        this.listeners.forEach(listener => listener.onAddedValidationRule(rule, diffOptions));
    }
    onRemovedRule(rule: ValidationRule<Specifics>, diffOptions: RuleOptions): void {
        // listeners of the composite will be notified about all removed inner rules
        this.listeners.forEach(listener => listener.onRemovedValidationRule(rule, diffOptions));
    }
}


export class CompositeValidationRule<Specifics extends TypirSpecifics> extends DefaultValidationCollector<Specifics> implements ValidationRuleLifecycle<Specifics> {
    /** The collector for inference rules, at which this composite rule should be registered. */
    protected readonly collectorToRegisterThisRule: ValidationCollector<Specifics>;

    constructor(services: TypirServices<Specifics>, collectorToRegisterThisRule: ValidationCollector<Specifics>) {
        super(services);
        this.collectorToRegisterThisRule = collectorToRegisterThisRule;
    }

    beforeValidation(languageRoot: Specifics['LanguageType'], accept: ValidationProblemAcceptor<Specifics>, _typir: TypirServices<Specifics>): void {
        this.validateBefore(languageRoot).forEach(v => accept(v));
    }

    validation(languageNode: Specifics['LanguageType'], accept: ValidationProblemAcceptor<Specifics>, _typir: TypirServices<Specifics>): void {
        this.validate(languageNode).forEach(v => accept(v));
    }

    afterValidation(languageRoot: Specifics['LanguageType'], accept: ValidationProblemAcceptor<Specifics>, _typir: TypirServices<Specifics>): void {
        this.validateAfter(languageRoot).forEach(v => accept(v));
    }

    override onAddedRule(rule: ValidationRule<Specifics>, diffOptions: RuleOptions): void {
        // an inner rule was added
        super.onAddedRule(rule, diffOptions);

        // this composite rule needs to be registered also for all the language keys of the new inner rule
        this.collectorToRegisterThisRule.addValidationRule(this, {
            ...diffOptions,
            boundToType: undefined,
        });
    }

    override onRemovedRule(rule: ValidationRule<Specifics>, diffOptions: RuleOptions): void {
        // an inner rule was removed
        super.onRemovedRule(rule, diffOptions);

        // remove this composite rule for all language keys for which no inner rules are registered anymore
        if (diffOptions.languageKey === undefined) {
            if (this.ruleRegistryFunctional.getRulesByLanguageKey(undefined).length <= 0 && this.ruleRegistryLifecycle.getRulesByLanguageKey(undefined).length <= 0) {
                this.collectorToRegisterThisRule.removeValidationRule(this, {
                    ...diffOptions,
                    languageKey: undefined,
                    boundToType: undefined, // a composite rule is never bound to a type, since it manages this feature itself
                });
            }
        } else {
            const languageKeysToUnregister = toArray(diffOptions.languageKey)
                .filter(key => this.ruleRegistryFunctional.getRulesByLanguageKey(key).length <= 0 && this.ruleRegistryLifecycle.getRulesByLanguageKey(key).length <= 0);
            this.collectorToRegisterThisRule.removeValidationRule(this, {
                ...diffOptions,
                languageKey: languageKeysToUnregister,
                boundToType: undefined, // a composite rule is never bound to a type, since it manages this feature itself
            });
        }
    }
}
