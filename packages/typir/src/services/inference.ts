/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { assertUnreachable } from 'langium';
import { TypeGraphListener } from '../graph/type-graph.js';
import { isType, Type } from '../graph/type-node.js';
import { TypirServices } from '../typir.js';
import { isSpecificTypirProblem, TypirProblem } from '../utils/utils-definitions.js';
import { toArrayWithValue, removeFromArray, toArray } from '../utils/utils.js';
import { LanguageNodeInferenceCaching } from './caching.js';

export interface InferenceProblem extends TypirProblem {
    $problem: 'InferenceProblem';
    languageNode: unknown;
    inferenceCandidate?: Type;
    location: string;
    rule?: TypeInferenceRule; // for debugging only, since rules have no names (so far); TODO this does not really work with TypeInferenceRuleWithoutInferringChildren
    subProblems: TypirProblem[]; // might be missing or empty
}
export const InferenceProblem = 'InferenceProblem';
export function isInferenceProblem(problem: unknown): problem is InferenceProblem {
    return isSpecificTypirProblem(problem, InferenceProblem);
}

// Type and Value to indicate, that an inference rule is intended for another case, and therefore is unable to infer a type for the current case.
export type InferenceRuleNotApplicable = 'N/A'; // or 'undefined' instead?
export const InferenceRuleNotApplicable = 'N/A'; // or 'undefined' instead?

type TypeInferenceResultWithoutInferringChildren =
    /** the identified type */
    Type |
    /** 'N/A' to indicate, that the current inference rule is not applicable for the given language node at all */
    InferenceRuleNotApplicable |
    /** a language node whose type should be inferred instead */
    unknown |
    /** an inference problem */
    InferenceProblem;
type TypeInferenceResultWithInferringChildren =
    /** the usual results, since it might be possible to determine the type of the parent without its children */
    TypeInferenceResultWithoutInferringChildren |
    /** the children whos types need to be inferred and taken into account to determine the parent's type */
    unknown[];

/**
 * Represents a single rule for inference,
 * i.e. only a single type (or no type at all) can be inferred for a given language node.
 * There are inference rules which dependent on types of children of the given language node (e.g. calls of overloaded functions depend on the types of the current arguments)
 * and there are inference rules without this need.
 *
 * Within inference rules, don't take the initialization state of the inferred type into account,
 * since such inferrence rules might not work for cyclic type definitions.
 */
export type TypeInferenceRule = TypeInferenceRuleWithoutInferringChildren | TypeInferenceRuleWithInferringChildren;

/** Usual inference rule which don't depend on children's types. */
export type TypeInferenceRuleWithoutInferringChildren = (languageNode: unknown, typir: TypirServices) => TypeInferenceResultWithoutInferringChildren;

/**
 * Inference rule which requires for the type inference of the given parent to take the types of its children into account.
 * Therefore, the types of the children need to be inferred first.
 */
export interface TypeInferenceRuleWithInferringChildren {
    /**
     * 1st step is to check, whether this inference rule is applicable to the given language node.
     * @param languageNode the language node whose type shall be inferred
     * @param typir the current Typir instance
     * @returns Only in the case, that child language nodes are returned,
     * the other function will be called for step 2, otherwise, it is skipped.
     */
    inferTypeWithoutChildren(languageNode: unknown, typir: TypirServices): TypeInferenceResultWithInferringChildren;

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
    inferTypeWithChildrensTypes(languageNode: unknown, childrenTypes: Array<Type | undefined>, typir: TypirServices): Type | InferenceProblem
}


export interface TypeInferenceCollectorListener {
    onAddedInferenceRule(rule: TypeInferenceRule, options: TypeInferenceRuleOptions): void;
    onRemovedInferenceRule(rule: TypeInferenceRule, options: TypeInferenceRuleOptions): void;
}

export interface TypeInferenceRuleOptions {
    /**
     * If an inference rule is associated with a language key, the inference rule will be executed only for language nodes, which have this language key,
     * in order to improve the runtime performance.
     * In case of multiple language keys, the inference rule will be applied to all language nodes having ones of these language keys.
     * Inference rules without a language key ('undefined') are executed for all language nodes.
     */
    languageKey: string | string[] | undefined;

    /**
     * An optional type, if the new inference rule is dedicated for exactly this type.
     * If the given type is removed from the type system, this rule will be automatically removed as well (for all language keys).
     * In case of multiple types, this rule will be removed, after all types are removed.
     * In case of 'undefined', the inference rule will never be automatically removed.
     */
    boundToType: Type | Type[] | undefined;
}
// corresponding information in a slightly different structure, which is easier to handle internally
interface InternalTypeInferenceRuleOptions {
    languageKeyUndefined: boolean;
    languageKeys: string[];
    boundToTypes: Type[];
}

/**
 * Collects an arbitrary number of inference rules
 * and allows to infer a type for a given language node.
 * In case of multiple inference rules, later rules are not evaluated anymore, if an earlier rule already returned a type.
 * Listeners could be registered in order to get informed about added and removed inference rules.
 */
export interface TypeInferenceCollector {
    /**
     * Infers a type for the given language node.
     * @param languageNode the language node whose type shall be inferred
     * @returns the found Type or some inference problems (might be empty), when none of the inference rules were able to infer a type
     */
    inferType(languageNode: unknown): Type | InferenceProblem[]

    /**
     * Registers an inference rule.
     * If an inference rule might be registered a second time, only those options are applied, which are not applied yet
     * Listeners will be informed only about these "difference" options.
     * @param rule a new inference rule
     * @param options additional options
     */
    addInferenceRule(rule: TypeInferenceRule, options?: Partial<TypeInferenceRuleOptions>): void;
    /**
     * Deregisters an inference rule.
     * @param rule the rule to remove
     * @param options The inference rule will be deregistered only regarding the given options,
     * the inference rule might still be registered for the not-specified options.
     * Listeners will be informed only about those removed options which were existing before.
     */
    removeInferenceRule(rule: TypeInferenceRule, options?: Partial<TypeInferenceRuleOptions>): void;

    addListener(listener: TypeInferenceCollectorListener): void;
    removeListener(listener: TypeInferenceCollectorListener): void;
}


export class DefaultTypeInferenceCollector implements TypeInferenceCollector, TypeGraphListener {
    // protected readonly inferenceRules: Map<string, TypeInferenceRule[]> = new Map(); // type identifier (otherwise '') -> inference rules
    /**
     * language node type --> inference rules
     * Improves the look-up of related rules, when doing type inference for a concrete language node. */
    protected readonly languageTypeToRules: Map<string|undefined, TypeInferenceRule[]> = new Map();
    /**
     * type identifier --> (language node type -> inference rules)
     * Improves the look-up for inference rules which are bound to types, when these types are removed. */
    protected readonly typirTypeToRules: Map<string, TypeInferenceRule[]> = new Map();
    /**
     * inference rule --> its collected options
     * Contains the current set of all options for an inference rule. */
    protected readonly ruleToOptions: Map<TypeInferenceRule, InternalTypeInferenceRuleOptions> = new Map();

    protected readonly languageNodeInference: LanguageNodeInferenceCaching;
    protected readonly services: TypirServices;
    protected readonly listeners: TypeInferenceCollectorListener[] = [];

    constructor(services: TypirServices) {
        this.services = services;
        this.languageNodeInference = services.caching.LanguageNodeInference;
        this.services.infrastructure.Graph.addListener(this);
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

    addInferenceRule(rule: TypeInferenceRule, givenOptions?: Partial<TypeInferenceRuleOptions>): void {
        const newOptions = this.getTypeInferenceRuleOptions(givenOptions);
        const languageKeyUndefined: boolean = newOptions.languageKey === undefined;
        const languageKeys: string[] = toArray(newOptions.languageKey);

        const existingOptions = this.ruleToOptions.get(rule);
        const diffOptions: TypeInferenceRuleOptions = {
            ...newOptions,
        };
        let added = false; // remember whether the rule is really new

        // register the inference rule with the key(s) of the language node
        if (languageKeyUndefined) {
            // register this rule for 'undefined'
            if (existingOptions?.languageKeyUndefined) {
                // nothing to do, since this rule is already registered for 'undefined'
            } else {
                // since the rule shall be registered for 'undefined', remove all existing specific language keys
                this.removeInferenceRule(rule, { languageKey: existingOptions?.languageKeys ?? [] });

                // register this rule for 'undefined'
                let rules = this.languageTypeToRules.get(undefined);
                if (rules === undefined) {
                    rules = [];
                    this.languageTypeToRules.set(undefined, rules);
                }
                rules.push(rule);
                if (existingOptions !== undefined) {
                    existingOptions.languageKeyUndefined = true;
                }
                added = true;
                diffOptions.languageKey = undefined;
            }
        } else {
            // register this rule for some language keys
            if (existingOptions?.languageKeyUndefined) {
                // don't add the new language keys, since this rule is already registered for 'undefined'
            } else {
                // add some more language keys
                for (const key of languageKeys) {
                    let rules = this.languageTypeToRules.get(key);
                    if (rules === undefined) {
                        rules = [];
                        this.languageTypeToRules.set(key, rules);
                    }
                    if (existingOptions === undefined) {
                        // this rule is unknown until now
                        rules.push(rule);
                        added = true;
                        diffOptions.languageKey = toArrayWithValue(key, diffOptions.languageKey);
                    } else {
                        if (existingOptions.languageKeys.includes(key)) {
                            // this rule is already registered with this language key => do nothing
                        } else {
                            // this rule is known, but not registered for the current language key yet
                            rules.push(rule);
                            existingOptions.languageKeys.push(key);
                            added = true;
                            diffOptions.languageKey = toArrayWithValue(key, diffOptions.languageKey);
                        }
                    }
                }
            }
        }

        // register the inference rule to Typir types in order to easily remove them together with removed types
        for (const boundToType of toArray(newOptions.boundToType)) {
            const typeKey = this.getBoundToTypeKey(boundToType);
            let rules = this.typirTypeToRules.get(typeKey);
            if (rules === undefined) {
                rules = [];
                this.typirTypeToRules.set(typeKey, rules);
            }
            if (existingOptions === undefined) {
                // this rule is unknown until now
                rules.push(rule);
                diffOptions.boundToType = toArrayWithValue(boundToType, diffOptions.boundToType);
                added = true;
            } else {
                if (existingOptions.boundToTypes.includes(boundToType)) {
                    // this rule is already bound to this type => do nothing
                } else {
                    // this rule is known, but not bound to the current type yet
                    existingOptions.boundToTypes.push(boundToType);
                    rules.push(rule);
                    diffOptions.boundToType = toArrayWithValue(boundToType, diffOptions.boundToType);
                    added = true;
                }
            }
        }

        if (existingOptions === undefined) {
            // no options yet => use the new options
            this.ruleToOptions.set(rule, {
                languageKeyUndefined: languageKeyUndefined,
                languageKeys: languageKeys,
                boundToTypes: toArray(newOptions.boundToType),
            });
        } else {
            // the existing options are already updated above
        }

        // inform all listeners about the new inference rule
        if (added) {
            this.listeners.forEach(listener => listener.onAddedInferenceRule(rule, diffOptions));
        }
    }

    removeInferenceRule(rule: TypeInferenceRule, optionsToRemove?: Partial<TypeInferenceRuleOptions>): void {
        const existingOptions = this.ruleToOptions.get(rule);
        if (existingOptions === undefined) { // these options need to be updated (or completely removed at the end)
            return; // the rule is unknown here => nothing to do
        }

        const languageKeyUndefined: boolean = optionsToRemove ? (optionsToRemove.languageKey === undefined) : false;
        const languageKeys: string[] = toArray(optionsToRemove?.languageKey);

        const diffOptions: TypeInferenceRuleOptions = {
            ...optionsToRemove,
            languageKey: [], // empty/nothing
            boundToType: [], // empty/nothing
        };
        let removed = false;

        // update 'language keys'
        if (languageKeyUndefined) {
            // deregister the rule for 'undefined'
            if (existingOptions.languageKeyUndefined) {
                const result = this.deregisterRuleForLanguageKey(rule, undefined);
                if (result) {
                    removed = true;
                    diffOptions.languageKey = undefined;
                }
            } else {
                // deregister the rule for all existing language keys
                languageKeys.push(...existingOptions.languageKeys);
            }
            existingOptions.languageKeyUndefined = false;
        }
        if (languageKeys.length >= 1) {
            // remove the rule for some language keys
            if (existingOptions.languageKeyUndefined) {
                // since the rule is registered for 'undefined', i.e. all language keys, don't remove some language keys here
            } else {
                for (const key of languageKeys) {
                    const result1 = this.deregisterRuleForLanguageKey(rule, key);
                    const result2 = removeFromArray(key, existingOptions.languageKeys); // update existing options
                    if (result1 !== result2) {
                        throw new Error();
                    }
                    if (result1) {
                        removed = true;
                        diffOptions.languageKey = toArrayWithValue(key, diffOptions.languageKey);
                    }
                }
            }
        }

        // update 'bounded types'
        for (const boundToType of toArray(optionsToRemove?.boundToType)) {
            const typeKey = this.getBoundToTypeKey(boundToType);
            const rules = this.typirTypeToRules.get(typeKey);
            if (rules) {
                const result = removeFromArray(rule, rules);
                if (result) {
                    removed = true;
                    diffOptions.boundToType = toArrayWithValue(boundToType, diffOptions.boundToType);
                    removeFromArray(boundToType , existingOptions.boundToTypes); // update existing options
                    if (rules.length <= 0) { // remove empty entries
                        this.typirTypeToRules.delete(typeKey);
                    }
                }
            }
        }

        // if the rule is not relevant anymore, clear the options map
        if (existingOptions.languageKeyUndefined === false && existingOptions.languageKeys.length <= 0) {
            this.ruleToOptions.delete(rule);
        }

        // inform listeners
        if (removed) {
            this.listeners.forEach(listener => listener.onRemovedInferenceRule(rule, diffOptions));
        }
    }

    protected deregisterRuleForLanguageKey(rule: TypeInferenceRule, languageKey: string | undefined): boolean {
        const rules = this.languageTypeToRules.get(languageKey);
        if (rules) {
            const result = removeFromArray(rule, rules);
            if (rules.length <= 0) { // remove empty entries
                this.languageTypeToRules.delete(languageKey);
            }
            return result;
        }
        return false;
    }

    protected getBoundToTypeKey(boundToType?: Type): string {
        return boundToType?.getIdentifier() ?? '';
    }

    inferType(languageNode: unknown): Type | InferenceProblem[] {
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

    protected checkForError(languageNode: unknown): void {
        if (languageNode === undefined || languageNode === null) {
            throw new Error('Language node must be not undefined/null!');
        }
    }

    protected inferTypeLogic(languageNode: unknown): Type | InferenceProblem[] {
        this.checkForError(languageNode);

        // determine all keys to check
        const keysToApply: Array<string|undefined> = [];
        const languageKey = this.services.Language.getLanguageNodeKey(languageNode);
        if (languageKey === undefined) {
            keysToApply.push(undefined);
        } else {
            keysToApply.push(languageKey); // execute the rules which are associated to the key of the current language node
            keysToApply.push(...this.services.Language.getAllSuperKeys(languageKey)); // apply all rules which are associated to super-keys
            keysToApply.push(undefined); // rules associated with 'undefined' are applied to all language nodes
        }

        // execute all rules wich are associated to the relevant language keys
        const collectedInferenceProblems: InferenceProblem[] = [];
        const alreadyExecutedRules: Set<TypeInferenceRule> = new Set();
        for (const key of keysToApply) {
            for (const rule of this.languageTypeToRules.get(key) ?? []) {
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

    protected executeSingleInferenceRuleLogic(rule: TypeInferenceRule, languageNode: unknown, collectedInferenceProblems: InferenceProblem[]): Type | undefined {
        if (typeof rule === 'function') {
            // simple case without type inference for children
            const ruleResult: TypeInferenceResultWithoutInferringChildren = rule(languageNode, this.services);
            this.checkForError(ruleResult);
            return this.inferTypeLogicWithoutChildren(ruleResult, collectedInferenceProblems);
        } else if (typeof rule === 'object') {
            // more complex case with inferring the type for children
            const ruleResult: TypeInferenceResultWithInferringChildren = rule.inferTypeWithoutChildren(languageNode, this.services);
            if (Array.isArray(ruleResult)) {
                // this rule might match => continue applying this rule
                // resolve the requested child types
                const childLanguageNodes = ruleResult;
                const actualChildTypes: Array<Type | InferenceProblem[]> = childLanguageNodes.map(child => this.services.Inference.inferType(child));
                // check, whether inferring the children resulted in some other inference problems
                const childTypeProblems: InferenceProblem[] = [];
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

    protected inferTypeLogicWithoutChildren(result: TypeInferenceResultWithoutInferringChildren, collectedInferenceProblems: InferenceProblem[]): Type | undefined {
        if (result === InferenceRuleNotApplicable) {
            // this rule is not applicable at all => ignore this rule
            return undefined;
        } else if (isType(result)) {
            // the result type is found!
            return result;
        } else if (isInferenceProblem(result)) {
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


    addListener(listener: TypeInferenceCollectorListener): void {
        this.listeners.push(listener);
    }
    removeListener(listener: TypeInferenceCollectorListener): void {
        removeFromArray(listener, this.listeners);
    }


    /* Get informed about deleted types in order to remove inference rules which are bound to them. */
    onRemovedType(type: Type, _key: string): void {
        const typeKey = this.getBoundToTypeKey(type); // TODO only if "typeKey === _key" ??
        const entriesToRemove = this.typirTypeToRules.get(typeKey);

        if (entriesToRemove) {
            this.typirTypeToRules.delete(typeKey);
            // for each rule which was bound to the removed type:
            for (const ruleToRemove of entriesToRemove) {
                const existingOptions = this.ruleToOptions.get(ruleToRemove)!;
                const removed = removeFromArray(type, existingOptions.boundToTypes);
                if (removed) {
                    // const removed = languageRules.delete(ruleToRemove);
                    if (existingOptions.boundToTypes.length <= 0) {
                        // this rule is not bound to any existing type anymore => remove this rule completely
                        this.removeInferenceRule(ruleToRemove, {
                            ...existingOptions,
                            languageKey: existingOptions.languageKeyUndefined ? undefined : existingOptions.languageKeys,
                        });
                    } else {
                        // inform listeners about removed inference rules
                        this.listeners.forEach(listener => listener.onRemovedInferenceRule(ruleToRemove, {
                            ...existingOptions,
                            languageKey: existingOptions.languageKeyUndefined ? undefined : existingOptions.languageKeys,
                            boundToType: type,
                            // Note that more future options might be unknown here ... (let's hope, they are not relevant here)
                        }));
                    }
                } else {
                    throw new Error('Removed type does not exist here');
                }
            }
        }
    }


    /* By default, the central cache of Typir is used. */

    protected cacheSet(languageNode: unknown, type: Type): void {
        this.languageNodeInference.cacheSet(languageNode, type);
    }

    protected cacheGet(languageNode: unknown): Type | undefined {
        return this.languageNodeInference.cacheGet(languageNode);
    }

    protected pendingSet(languageNode: unknown): void {
        this.languageNodeInference.pendingSet(languageNode);
    }
    protected pendingClear(languageNode: unknown): void {
        this.languageNodeInference.pendingClear(languageNode);
    }
    protected pendingGet(languageNode: unknown): boolean {
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
export class CompositeTypeInferenceRule extends DefaultTypeInferenceCollector implements TypeInferenceRuleWithInferringChildren {
    /** The collector for inference rules, at which this composite rule should be registered. */
    protected readonly collectorToRegisterThisRule: TypeInferenceCollector;

    constructor(services: TypirServices, collectorToRegisterThisRule: TypeInferenceCollector) {
        super(services);
        this.collectorToRegisterThisRule = collectorToRegisterThisRule;
    }

    // do not check "pending" (again), since it is already checked by the "parent" DefaultTypeInferenceCollector!
    override pendingGet(_languageNode: unknown): boolean {
        return false;
    }

    inferTypeWithoutChildren(languageNode: unknown, _typir: TypirServices): TypeInferenceResultWithInferringChildren {
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
                return <InferenceProblem>{
                    $problem: InferenceProblem,
                    languageNode: languageNode,
                    location: 'sub-rules for inference',
                    rule: this,
                    subProblems: result,
                };
            }
        }
    }

    inferTypeWithChildrensTypes(_languageNode: unknown, _childrenTypes: Array<Type | undefined>, _typir: TypirServices): Type | InferenceProblem {
        throw new Error('This function will not be called.');
    }

    override addInferenceRule(rule: TypeInferenceRule, givenOptions?: Partial<TypeInferenceRuleOptions>): void {
        // register the rule for inference
        super.addInferenceRule(rule, givenOptions);

        // update the registration of this composite rule:
        // - ensures that this composite rule itself is associated with all the language keys of the inner rules
        // - boundToType := undefined, since this composite manages its removal in case of deleted inner rules/nodes
        this.collectorToRegisterThisRule.addInferenceRule(this, { languageKey: givenOptions?.languageKey, boundToType: undefined });
    }

    override removeInferenceRule(rule: TypeInferenceRule, givenOptions?: Partial<TypeInferenceRuleOptions>): void {
        // deregister the rule, don't use it for inference anymore
        super.removeInferenceRule(rule, givenOptions);

        // update the registration of this composite rule:
        // - updates the language keys which are associated with this composite rule itself
        // - boundToType := undefined, since this composite manages its removal in case of deleted inner rules/nodes
        this.collectorToRegisterThisRule.removeInferenceRule(this, { languageKey: givenOptions?.languageKey, boundToType: undefined });
    }

    override onRemovedType(type: Type, key: string): void {
        // remember the language keys before removing the rules bound to the removed type
        const remainingLanguageKeys = Array.from(this.languageTypeToRules.keys());

        // After removing a type and all (inner) rules which are bound to this type ...
        super.onRemovedType(type, key);

        if (this.languageTypeToRules.size <= 0) { // remark: don't use 'typirTypeToRules', since it does not contain rules which are not bound to types
            // ... there are no inner rules left => de-register this composite rule for all remaining language keys before the removal
            const remainingLanguageKeysNotUndefined = remainingLanguageKeys.filter(k => k !== undefined);
            if (remainingLanguageKeysNotUndefined.length >= 1) {
                this.collectorToRegisterThisRule.removeInferenceRule(this, { languageKey: remainingLanguageKeysNotUndefined, boundToType: undefined });
            }
            if (remainingLanguageKeys.length > remainingLanguageKeysNotUndefined.length) {
                this.collectorToRegisterThisRule.removeInferenceRule(this, { languageKey: undefined, boundToType: undefined });
            }
        }
    }
}
