/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { assertUnreachable } from 'langium';
import { isType, Type } from '../graph/type-node.js';
import { TypirServices } from '../typir.js';
import { RuleCollectorListener, RuleOptions, RuleRegistry } from '../utils/rule-registration.js';
import { isSpecificTypirProblem, TypirProblem } from '../utils/utils-definitions.js';
import { removeFromArray, toArray } from '../utils/utils.js';
import { LanguageNodeInferenceCaching } from './caching.js';

export interface InferenceProblem<LanguageType = unknown> extends TypirProblem {
    $problem: 'InferenceProblem';
    languageNode: LanguageType;
    inferenceCandidate?: Type;
    location: string;
    rule?: TypeInferenceRule<LanguageType>; // for debugging only, since rules have no names (so far); TODO this does not really work with TypeInferenceRuleWithoutInferringChildren
    subProblems: TypirProblem[]; // might be missing or empty
}
export const InferenceProblem = 'InferenceProblem';
export function isInferenceProblem<LanguageType = unknown>(problem: unknown): problem is InferenceProblem<LanguageType> {
    return isSpecificTypirProblem(problem, InferenceProblem);
}

// Type and Value to indicate, that an inference rule is intended for another case, and therefore is unable to infer a type for the current case.
export type InferenceRuleNotApplicable = 'N/A'; // or 'undefined' instead?
export const InferenceRuleNotApplicable = 'N/A'; // or 'undefined' instead?

export type TypeInferenceResultWithoutInferringChildren<LanguageType = unknown> =
    /** the identified type */
    Type |
    /** 'N/A' to indicate, that the current inference rule is not applicable for the given language node at all */
    InferenceRuleNotApplicable |
    /** a language node whose type should be inferred instead */
    LanguageType |
    /** an inference problem */
    InferenceProblem<LanguageType>;
export type TypeInferenceResultWithInferringChildren<LanguageType = unknown> =
    /** the usual results, since it might be possible to determine the type of the parent without its children */
    TypeInferenceResultWithoutInferringChildren<LanguageType> |
    /** the children whos types need to be inferred and taken into account to determine the parent's type */
    LanguageType[];

/**
 * Represents a single rule for inference,
 * i.e. only a single type (or no type at all) can be inferred for a given language node.
 * There are inference rules which dependent on types of children of the given language node (e.g. calls of overloaded functions depend on the types of the current arguments)
 * and there are inference rules without this need.
 *
 * Within inference rules, don't take the initialization state of the inferred type into account,
 * since such inferrence rules might not work for cyclic type definitions.
 */
export type TypeInferenceRule<LanguageType = unknown, InputType = LanguageType> = TypeInferenceRuleWithoutInferringChildren<LanguageType, InputType> | TypeInferenceRuleWithInferringChildren<LanguageType, InputType>;

/** Usual inference rule which don't depend on children's types. */
export type TypeInferenceRuleWithoutInferringChildren<LanguageType = unknown, InputType = LanguageType> =
    (languageNode: InputType, typir: TypirServices<LanguageType>) => TypeInferenceResultWithoutInferringChildren<LanguageType>;

/**
 * Inference rule which requires for the type inference of the given parent to take the types of its children into account.
 * Therefore, the types of the children need to be inferred first.
 */
export interface TypeInferenceRuleWithInferringChildren<LanguageType = unknown, InputType = LanguageType> {
    /**
     * 1st step is to check, whether this inference rule is applicable to the given language node.
     * @param languageNode the language node whose type shall be inferred
     * @param typir the current Typir instance
     * @returns Only in the case, that child language nodes are returned,
     * the other function will be called for step 2, otherwise, it is skipped.
     */
    inferTypeWithoutChildren(languageNode: InputType, typir: TypirServices<LanguageType>): TypeInferenceResultWithInferringChildren<LanguageType>;

    /**
     * 2nd step is to finally decide about the inferred type.
     * When the 1st step returned a list of language nodes to resolve their types,
     * this function is called in order to complete this inference rule, otherwise, this step is not called.
     * Advantage of this step is to split it to allow a postponed inferrence of the additional language nodes by Typir.
     * Disadvantage of this step is, that already checked TS types of languageNode cannot be reused.
     * @param languageNode the language node whose type shall be inferred
     * @param childrenTypes the types which are inferred from the language nodes of the 1st step (in the same order!)
     * @param typir the current Typir instance
     * @returns the finally inferred type or a problem, why this inference rule is finally not applicable
     */
    inferTypeWithChildrensTypes(languageNode: InputType, childrenTypes: Array<Type | undefined>, typir: TypirServices<LanguageType>): Type | InferenceProblem<LanguageType>;
}


export interface TypeInferenceCollectorListener<LanguageType = unknown> {
    onAddedInferenceRule(rule: TypeInferenceRule<LanguageType>, options: TypeInferenceRuleOptions): void;
    onRemovedInferenceRule(rule: TypeInferenceRule<LanguageType>, options: TypeInferenceRuleOptions): void;
}

export interface TypeInferenceRuleOptions extends RuleOptions {
    // no additional properties so far
}

/**
 * Collects an arbitrary number of inference rules
 * and allows to infer a type for a given language node.
 * In case of multiple inference rules, later rules are not evaluated anymore, if an earlier rule already returned a type.
 * Listeners could be registered in order to get informed about added and removed inference rules.
 */
export interface TypeInferenceCollector<LanguageType = unknown> {
    /**
     * Infers a type for the given language node.
     * @param languageNode the language node whose type shall be inferred
     * @returns the found Type or some inference problems (might be empty), when none of the inference rules were able to infer a type
     */
    inferType(languageNode: LanguageType): Type | Array<InferenceProblem<LanguageType>>;

    /**
     * Registers an inference rule.
     * If an inference rule might be registered a second time, only those options are applied, which are not applied yet
     * Listeners will be informed only about these "difference" options.
     * @param rule a new inference rule
     * @param options additional options
     */
    addInferenceRule(rule: TypeInferenceRule<LanguageType>, options?: Partial<TypeInferenceRuleOptions>): void;
    /**
     * Deregisters an inference rule.
     * @param rule the rule to remove
     * @param options The inference rule will be deregistered only regarding the given options,
     * the inference rule might still be registered for the not-specified options.
     * Listeners will be informed only about those removed options which were existing before.
     */
    removeInferenceRule(rule: TypeInferenceRule<LanguageType>, options?: Partial<TypeInferenceRuleOptions>): void;

    addListener(listener: TypeInferenceCollectorListener<LanguageType>): void;
    removeListener(listener: TypeInferenceCollectorListener<LanguageType>): void;
}


export class DefaultTypeInferenceCollector<LanguageType = unknown> implements TypeInferenceCollector<LanguageType>, RuleCollectorListener<TypeInferenceRule<LanguageType>> {
    protected readonly ruleRegistry: RuleRegistry<TypeInferenceRule<LanguageType>, LanguageType>;

    protected readonly languageNodeInference: LanguageNodeInferenceCaching;
    protected readonly services: TypirServices<LanguageType>;
    protected readonly listeners: Array<TypeInferenceCollectorListener<LanguageType>> = [];

    constructor(services: TypirServices<LanguageType>) {
        this.services = services;
        this.languageNodeInference = services.caching.LanguageNodeInference;
        this.ruleRegistry = new RuleRegistry(services);
        this.ruleRegistry.addListener(this);
    }

    protected getTypeInferenceRuleOptions(options?: Partial<TypeInferenceRuleOptions>): TypeInferenceRuleOptions {
        return {
            // default values ...
            languageKey: undefined,
            boundToType: undefined,
            // ... overridden by the actual options:
            ...options,
        };
    }

    protected getLanguageKeys(options?: Partial<TypeInferenceRuleOptions>): Array<string|undefined> {
        if (options === undefined || options.languageKey === undefined) {
            return [undefined];
        } else {
            return toArray(options.languageKey);
        }
    }

    addInferenceRule(rule: TypeInferenceRule<LanguageType>, givenOptions?: Partial<TypeInferenceRuleOptions>): void {
        this.ruleRegistry.addRule(rule, givenOptions);
    }

    removeInferenceRule(rule: TypeInferenceRule<LanguageType>, optionsToRemove?: Partial<TypeInferenceRuleOptions>): void {
        this.ruleRegistry.removeRule(rule, optionsToRemove);
    }

    inferType(languageNode: LanguageType): Type | Array<InferenceProblem<LanguageType>> {
        // is the result already in the cache?
        const cached = this.cacheGet(languageNode);
        if (cached) {
            return cached;
        }

        // handle recursion loops
        if (this.pendingGet(languageNode)) {
            throw new Error(`There is a recursion loop for inferring the type from ${languageNode}! Probably, there are multiple interfering inference rules.`);
        }
        this.pendingSet(languageNode);

        // do the actual type inference
        const result = this.inferTypeLogic(languageNode);

        // the calculation is done
        this.pendingClear(languageNode);

        // remember the calculated type in the cache
        if (isType(result)) {
            this.cacheSet(languageNode, result);
        }
        return result;
    }

    protected checkForError(languageNode: LanguageType): void {
        if (languageNode === undefined || languageNode === null) {
            throw new Error('Language node must be not undefined/null!');
        }
    }

    protected inferTypeLogic(languageNode: LanguageType): Type | Array<InferenceProblem<LanguageType>> {
        this.checkForError(languageNode);

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
        const collectedInferenceProblems: Array<InferenceProblem<LanguageType>> = [];
        const alreadyExecutedRules: Set<TypeInferenceRule<LanguageType>> = new Set();
        for (const key of keysToApply) {
            for (const rule of this.ruleRegistry.getRulesByLanguageKey(key)) {
                if (alreadyExecutedRules.has(rule)) {
                    // don't execute rules multiple times, if they are associated with multiple keys (with overlapping sub-keys)
                } else {
                    const result = this.executeSingleInferenceRuleLogic(rule, languageNode, collectedInferenceProblems);
                    if (result) {
                        return result; // return the first inferred type, otherwise, check the next inference rules
                    }
                    alreadyExecutedRules.add(rule);
                }
            }
        }

        // return all the collected inference problems
        if (collectedInferenceProblems.length <= 0) {
            // document the reason, why neither a type nor inference problems are found
            collectedInferenceProblems.push({
                $problem: InferenceProblem,
                languageNode: languageNode,
                location: 'found no applicable inference rules',
                subProblems: [],
            });
        }
        return collectedInferenceProblems;
    }

    protected executeSingleInferenceRuleLogic(rule: TypeInferenceRule<LanguageType>, languageNode: LanguageType, collectedInferenceProblems: Array<InferenceProblem<LanguageType>>): Type | undefined {
        if (typeof rule === 'function') {
            // simple case without type inference for children
            const ruleResult: TypeInferenceResultWithoutInferringChildren<LanguageType> = rule(languageNode, this.services);
            return this.inferTypeLogicWithoutChildren(ruleResult, collectedInferenceProblems);
        } else if (typeof rule === 'object') {
            // more complex case with inferring the type for children
            const ruleResult: TypeInferenceResultWithInferringChildren<LanguageType> = rule.inferTypeWithoutChildren(languageNode, this.services);
            if (Array.isArray(ruleResult)) {
                // this rule might match => continue applying this rule
                // resolve the requested child types
                const childLanguageNodes = ruleResult;
                const actualChildTypes: Array<Type | Array<InferenceProblem<LanguageType>>> = childLanguageNodes.map(child => this.services.Inference.inferType(child));
                // check, whether inferring the children resulted in some other inference problems
                const childTypeProblems: Array<InferenceProblem<LanguageType>> = [];
                for (let i = 0; i < actualChildTypes.length; i++) {
                    const child = actualChildTypes[i];
                    if (Array.isArray(child)) {
                        childTypeProblems.push({
                            $problem: InferenceProblem,
                            languageNode: childLanguageNodes[i],
                            location: `child language node ${i}`,
                            rule,
                            subProblems: child,
                        });
                    }
                }
                if (childTypeProblems.length >= 1) {
                    collectedInferenceProblems.push({
                        $problem: InferenceProblem,
                        languageNode: languageNode,
                        location: 'inferring depending children',
                        rule,
                        subProblems: childTypeProblems,
                    });
                    return undefined;
                } else {
                    // the types of all children are successfully inferred
                    const finalInferenceResult = rule.inferTypeWithChildrensTypes(languageNode, actualChildTypes as Type[], this.services);
                    if (isType(finalInferenceResult)) {
                        // type is inferred!
                        return finalInferenceResult;
                    } else {
                        // inference is not applicable (probably due to a mismatch of the children's types) => check the next rule
                        collectedInferenceProblems.push(finalInferenceResult);
                        return undefined;
                    }
                }
            } else {
                return this.inferTypeLogicWithoutChildren(ruleResult, collectedInferenceProblems);
            }
        } else {
            assertUnreachable(rule);
        }
    }

    protected inferTypeLogicWithoutChildren(result: TypeInferenceResultWithoutInferringChildren<LanguageType>, collectedInferenceProblems: Array<InferenceProblem<LanguageType>>): Type | undefined {
        if (result === InferenceRuleNotApplicable) {
            // this rule is not applicable at all => ignore this rule
            return undefined;
        } else if (isType(result)) {
            // the result type is found!
            return result;
        } else if (isInferenceProblem<LanguageType>(result)) {
            // found some inference problems
            collectedInferenceProblems.push(result);
            return undefined;
        } else {
            // this 'result' language node is used instead to infer its type, which is the type for the current language node as well
            const recursiveResult = this.inferType(result);
            if (Array.isArray(recursiveResult)) {
                collectedInferenceProblems.push(...recursiveResult);
                return undefined;
            } else {
                return recursiveResult;
            }
        }
    }


    addListener(listener: TypeInferenceCollectorListener<LanguageType>): void {
        this.listeners.push(listener);
    }
    removeListener(listener: TypeInferenceCollectorListener<LanguageType>): void {
        removeFromArray(listener, this.listeners);
    }

    // This inference collector is notified by the rule registry and forwards these notifications to its own listeners

    onAddedRule(rule: TypeInferenceRule<LanguageType>, diffOptions: RuleOptions): void {
        // listeners of the composite will be notified about all added inner rules
        this.listeners.forEach(listener => listener.onAddedInferenceRule(rule, diffOptions));
    }
    onRemovedRule(rule: TypeInferenceRule<LanguageType>, diffOptions: RuleOptions): void {
        // clear the cache, since its entries might be created using the removed rule
        // possible performance improvement: remove only entries which depend on the removed rule?
        this.cacheClear();
        // listeners of the composite will be notified about all removed inner rules
        this.listeners.forEach(listener => listener.onRemovedInferenceRule(rule, diffOptions));
    }


    /* By default, the central cache of Typir is used. */

    protected cacheSet(languageNode: LanguageType, type: Type): void {
        this.languageNodeInference.cacheSet(languageNode, type);
    }

    protected cacheGet(languageNode: LanguageType): Type | undefined {
        return this.languageNodeInference.cacheGet(languageNode);
    }

    protected cacheClear(): void {
        this.languageNodeInference.cacheClear();
    }

    protected pendingSet(languageNode: LanguageType): void {
        this.languageNodeInference.pendingSet(languageNode);
    }
    protected pendingClear(languageNode: LanguageType): void {
        this.languageNodeInference.pendingClear(languageNode);
    }
    protected pendingGet(languageNode: LanguageType): boolean {
        return this.languageNodeInference.pendingGet(languageNode);
    }
}


/**
 * This inference rule uses multiple internal inference rules for doing the type inference.
 * If one of the child rules returns a type, this type is the result of the composite rule.
 * Otherwise, all problems of all child rules are returned.
 *
 * This composite rule ensures itself, that it is associated to the set of language keys of the inner rules.
 */
// This design looks a bit ugly ..., but "implements TypeInferenceRuleWithoutInferringChildren" does not work, since it is a function ...
export class CompositeTypeInferenceRule<LanguageType = unknown> extends DefaultTypeInferenceCollector<LanguageType> implements TypeInferenceRuleWithInferringChildren<LanguageType> {
    /** The collector for inference rules, at which this composite rule should be registered. */
    protected readonly collectorToRegisterThisRule: TypeInferenceCollector<LanguageType>;

    constructor(services: TypirServices<LanguageType>, collectorToRegisterThisRule: TypeInferenceCollector<LanguageType>) {
        super(services);
        this.collectorToRegisterThisRule = collectorToRegisterThisRule;
    }

    // do not check "pending" (again), since it is already checked by the "parent" DefaultTypeInferenceCollector!
    override pendingGet(_languageNode: unknown): boolean {
        return false;
    }
    protected override pendingSet(_languageNode: LanguageType): void {
        // nothing to do, since the pending state is not used in this composite rule
    }
    protected override pendingClear(_languageNode: LanguageType): void {
        // nothing to do, since the pending state is not used in this composite rule
    }

    inferTypeWithoutChildren(languageNode: LanguageType, _typir: TypirServices<LanguageType>): TypeInferenceResultWithInferringChildren<LanguageType> {
        // do the type inference
        const result = this.inferType(languageNode);
        if (isType(result)) {
            return result;
        } else {
            if (result.length <= 0) {
                return InferenceRuleNotApplicable;
            } else if (result.length === 1) {
                return result[0];
            } else {
                return <InferenceProblem<LanguageType>>{
                    $problem: InferenceProblem,
                    languageNode: languageNode,
                    location: 'sub-rules for inference',
                    rule: this,
                    subProblems: result,
                };
            }
        }
    }

    inferTypeWithChildrensTypes(_languageNode: LanguageType, _childrenTypes: Array<Type | undefined>, _typir: TypirServices<LanguageType>): Type | InferenceProblem<LanguageType> {
        throw new Error('This function will not be called.');
    }

    override onAddedRule(rule: TypeInferenceRule<LanguageType>, diffOptions: RuleOptions): void {
        // an inner rule was added
        super.onAddedRule(rule, diffOptions);

        // this composite rule needs to be registered also for all the language keys of the new inner rule
        this.collectorToRegisterThisRule.addInferenceRule(this, {
            ...diffOptions,
            boundToType: undefined,
        });
    }

    override onRemovedRule(rule: TypeInferenceRule<LanguageType>, diffOptions: RuleOptions): void {
        // an inner rule was removed
        super.onRemovedRule(rule, diffOptions);

        // remove this composite rule for all language keys for which no inner rules are registered anymore
        if (diffOptions.languageKey === undefined) {
            if (this.ruleRegistry.getRulesByLanguageKey(undefined).length <= 0) {
                this.collectorToRegisterThisRule.removeInferenceRule(this, {
                    ...diffOptions,
                    languageKey: undefined,
                    boundToType: undefined, // a composite rule is never bound to a type, since it manages this feature itself
                });
            }
        } else {
            const languageKeysToUnregister = toArray(diffOptions.languageKey).filter(key => this.ruleRegistry.getRulesByLanguageKey(key).length <= 0);
            this.collectorToRegisterThisRule.removeInferenceRule(this, {
                ...diffOptions,
                languageKey: languageKeysToUnregister,
                boundToType: undefined, // a composite rule is never bound to a type, since it manages this feature itself
            });
        }
    }
}
