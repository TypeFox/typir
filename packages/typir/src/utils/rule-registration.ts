/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
******************************************************************************/

import { TypeGraphListener } from '../graph/type-graph.js';
import { Type } from '../graph/type-node.js';
import { TypirSpecifics, TypirServices } from '../typir.js';
import { removeFromArray, toArray, toArrayWithValue } from './utils.js';

export interface RuleOptions {
    /**
     * If a rule is associated with a language key, the rule will be executed only for language nodes, which have this language key,
     * in order to improve the runtime performance.
     * In case of multiple language keys, the rule will be applied to all language nodes having ones of these language keys.
     * Rules without a language key ('undefined') are executed for all language nodes.
     */
    languageKey: string | string[] | undefined;

    /**
     * An optional type, if the new rule is dedicated for exactly this type.
     * If the given type is removed from the type system, this rule will be automatically removed as well (for all language keys).
     * In case of multiple types, this rule will be removed, after all types are removed.
     * In case of 'undefined', the rule will never be automatically removed.
     */
    boundToType: Type | Type[] | undefined;
}

// corresponding information in a slightly different structure, which is easier to handle internally
interface InternalRuleOptions {
    languageKeyUndefined: boolean;
    languageKeys: string[];
    boundToTypes: Type[];
}

export interface RuleCollectorListener<RuleType> {
    onAddedRule(rule: RuleType, diffOptions: RuleOptions): void;
    onRemovedRule(rule: RuleType, diffOptions: RuleOptions): void;
}

export class RuleRegistry<RuleType, Specifics extends TypirSpecifics> implements TypeGraphListener {
    /**
     * language node type --> rules
     * Improves the look-up of related rules, when doing type for a concrete language node.
     * All rules are registered at least once in this map, since rules without dedicated language key are registered to 'undefined'. */
    protected readonly languageTypeToRules: Map<string|undefined, RuleType[]> = new Map();
    /**
     * type identifier --> -> rules
     * Improves the look-up for rules which are bound to types, when these types are removed.
     * Only rules which are bound to at least one type in this map, types bound to no types are missing in this map. */
    protected readonly typirTypeToRules: Map<string, RuleType[]> = new Map();
    /**
     * rule --> its collected options
     * Contains the current set of all options for an rule. */
    protected readonly ruleToOptions: Map<RuleType, InternalRuleOptions> = new Map();

    /** Collects all unique rules, lazily managed. */
    protected readonly uniqueRules: Set<RuleType> = new Set();

    protected readonly listeners: Array<RuleCollectorListener<RuleType>> = [];


    constructor(services: TypirServices<Specifics>) {
        services.infrastructure.Graph.addListener(this);
    }

    getRulesByLanguageKey(languageKey: string | undefined): RuleType[] {
        const store = this.languageTypeToRules.get(languageKey);
        if (store === undefined) {
            return [];
        }
        return store;
    }

    /** Unique set of all registered rules. */
    getUniqueRules(): Set<RuleType> {
        if (this.uniqueRules.size <= 0) {
            // lazily fill the set of unique rules
            Array.from(this.languageTypeToRules.values()).flatMap(v => v).forEach(v => this.uniqueRules.add(v));
        }
        return this.uniqueRules;
    }

    isEmpty(): boolean {
        return this.languageTypeToRules.size <= 0;
    }

    getNumberUniqueRules(): number {
        return this.getUniqueRules().size;
    }

    protected getRuleOptions(options?: Partial<RuleOptions>): RuleOptions {
        return {
            // default values ...
            languageKey: undefined,
            boundToType: undefined,
            // ... overridden by the actual options:
            ...options,
        };
    }

    addRule(rule: RuleType, givenOptions?: Partial<RuleOptions>): void {
        const newOptions = this.getRuleOptions(givenOptions);
        const languageKeyUndefined: boolean = newOptions.languageKey === undefined;
        const languageKeys: string[] = toArray(newOptions.languageKey, { newArray: true });

        const existingOptions = this.ruleToOptions.get(rule);
        const diffOptions: RuleOptions = {
            ...newOptions,
            languageKey: [], // empty for now, added keys will be added later
            boundToType: [],
        };
        let added = false; // remember whether the rule is really new

        // register the rule with the key(s) of the language node
        if (languageKeyUndefined) {
            // register this rule for 'undefined'
            if (existingOptions?.languageKeyUndefined) {
                // nothing to do, since this rule is already registered for 'undefined'
            } else {
                // since the rule shall be registered for 'undefined', remove all existing specific language keys
                this.removeRule(rule, { languageKey: existingOptions?.languageKeys ?? [] });

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

        // register the rule to Typir types in order to easily remove them together with removed types
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
                boundToTypes: toArray(newOptions.boundToType, { newArray: true }),
            });
        } else {
            // the existing options are already updated above
        }

        // update the set of unique rules
        if (this.uniqueRules.size >= 1) {
            this.uniqueRules.add(rule);
        } else {
            // otherwise the set is populated on the next request
        }

        // inform all listeners about the new rule
        if (added) {
            this.listeners.forEach(listener => listener.onAddedRule(rule, diffOptions));
        }
    }

    removeRule(rule: RuleType, optionsToRemove?: Partial<RuleOptions>): void {
        const existingOptions = this.ruleToOptions.get(rule);
        if (existingOptions === undefined) { // these options need to be updated (or completely removed at the end)
            return; // the rule is unknown here => nothing to do
        }

        const languageKeyUndefined: boolean = optionsToRemove ? (optionsToRemove.languageKey === undefined) : true;
        const languageKeys: string[] = toArray(optionsToRemove?.languageKey, { newArray: true });

        const diffOptions: RuleOptions = {
            // ... maybe more options in the future ...
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

        // update the set of unique rules
        this.uniqueRules.clear(); // the set needs to be populated on the next request

        // inform listeners
        if (removed) {
            this.listeners.forEach(listener => listener.onRemovedRule(rule, diffOptions));
        }
    }

    protected deregisterRuleForLanguageKey(rule: RuleType, languageKey: string | undefined): boolean {
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

    /* Get informed about deleted types in order to remove rules which are bound to them. */
    onRemovedType(type: Type, _key: string): void {
        const typeKey = this.getBoundToTypeKey(type); // TODO only if "typeKey === _key" ?? this needs to be double-checked when making Alias types explicit!
        const entriesToRemove = this.typirTypeToRules.get(typeKey);

        if (entriesToRemove) {
            this.typirTypeToRules.delete(typeKey);

            // for each rule which was bound to the removed type:
            for (const ruleToRemove of entriesToRemove) {
                const existingOptions = this.ruleToOptions.get(ruleToRemove)!;
                const removed = removeFromArray(type, existingOptions.boundToTypes);
                if (removed) {
                    if (existingOptions.boundToTypes.length <= 0) {
                        // this rule is not bound to any existing type anymore => remove this rule completely
                        this.removeRule(ruleToRemove, {
                            // ... maybe additional properties in the future?
                            // boundToType: there are no bounded types anymore!
                            languageKey: existingOptions.languageKeyUndefined ? undefined : existingOptions.languageKeys,
                        });
                    } else {
                        // inform listeners about removed rules
                        this.listeners.forEach(listener => listener.onRemovedRule(ruleToRemove, {
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

    addListener(listener: RuleCollectorListener<RuleType>): void {
        this.listeners.push(listener);
    }

    removeListener(listener: RuleCollectorListener<RuleType>): void {
        removeFromArray(listener, this.listeners);
    }
}
