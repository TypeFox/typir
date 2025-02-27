/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

/* eslint-disable @typescript-eslint/no-explicit-any */

import { isType, Type } from '../graph/type-node.js';
import { TypeInitializer } from '../initialization/type-initializer.js';
import { InferenceRuleNotApplicable, TypeInferenceRule, TypeInferenceRuleOptions } from '../services/inference.js';
import { TypirServices } from '../typir.js';
import { toArray } from './utils.js';

/**
 * Common interface of all problems/errors/messages which should be shown to users of DSLs which are type-checked with Typir.
 * This approach makes it easier to introduce additional errors by users of Typir, compared to a union type, e.g. export type TypirProblem = ValueConflict | IndexedTypeConflict | ...
 */
export interface TypirProblem {
    readonly $problem: string;
}
export function isSpecificTypirProblem(problem: unknown, $problem: string): problem is TypirProblem {
    return typeof problem === 'object' && problem !== null && ((problem as TypirProblem).$problem === $problem);
}

export type Types = Type | Type[];
export type Names = string | string[];
export type TypeInitializers<T extends Type = Type> = TypeInitializer<T> | Array<TypeInitializer<T>>;

export type NameTypePair = {
    name: string;
    type: Type;
}
export function isNameTypePair(type: unknown): type is NameTypePair {
    return typeof type === 'object' && type !== null && typeof (type as NameTypePair).name === 'string' && isType((type as NameTypePair).type);
}



//
// Utilities for type inference
//

/** A pair of a rule for type inference with its additional options. */
export interface InferenceRuleWithOptions<T extends TypeInferenceRule = TypeInferenceRule> {
    rule: T;
    options: Partial<TypeInferenceRuleOptions>;
}

export function optionsBoundToType(options: Partial<TypeInferenceRuleOptions>, type: Type | undefined): Partial<TypeInferenceRuleOptions> {
    return {
        ...options,
        boundToType: type,
    };
}

export function ruleWithOptionsBoundToType<T extends TypeInferenceRule = TypeInferenceRule>(rule: InferenceRuleWithOptions<T>, type: Type | undefined): InferenceRuleWithOptions<T> {
    return {
        rule: rule.rule,
        options: optionsBoundToType(rule.options, type),
    };
}


/**
 * An inference rule which is dedicated for inferrring a certain type.
 * This utility type is often used for inference rules which are annotated to the declaration of a type.
 * At least one of the properties needs to be specified.
 */
export interface InferCurrentTypeRule<T = unknown> {
    languageKey?: string;
    filter?: (languageNode: unknown) => languageNode is T;
    matching?: (languageNode: T) => boolean;
}

export function bindInferCurrentTypeRule<T>(rule: InferCurrentTypeRule<T>, type: Type): InferenceRuleWithOptions {
    if (rule.languageKey === undefined && rule.filter === undefined && rule.matching === undefined) {
        throw new Error('This inference rule has no properties at all and therefore cannot infer any type!'); // fail early
    }
    return {
        rule: (languageNode, _typir) => {
            // when this function is called, it is already ensured, that the (non-undefined) language key of rule and language node fit!
            if (rule.filter !== undefined) {
                if (rule.filter(languageNode)) {
                    if (rule.matching !== undefined) {
                        if (rule.matching(languageNode)) {
                            return type;
                        } else {
                            return InferenceRuleNotApplicable; // TODO or an InferenceProblem?
                        }
                    } else {
                        return type; // the filter was successful and there is no additional matching
                    }
                } else {
                    return InferenceRuleNotApplicable; // TODO or an InferenceProblem?
                }
            }
            if (rule.matching !== undefined) {
                if (rule.matching(languageNode as T)) {
                    return type;
                } else {
                    return InferenceRuleNotApplicable; // TODO or an InferenceProblem?
                }
            }
            // Usually the 'languageKey' will be used only to register the inference rule, not during its execution. Therefore it is checked only here at the end:
            if (rule.languageKey !== undefined) {
                return type; // sometimes it is enough to filter only by the language key, e.g. in case of dedicated "IntegerLiteral"s which always have an "Integer" type
            } else {
                throw new Error('This inference rule has no properties at all and therefore cannot infer any type!');
            }
        },
        options: {
            languageKey: rule.languageKey,
            boundToType: type,
        }
    };
}

export function registerInferCurrentTypeRules<T>(rules: InferCurrentTypeRule<T> | Array<InferCurrentTypeRule<T>> | undefined, type: Type, services: TypirServices): void {
    for (const ruleSingle of toArray(rules)) {
        const {rule, options} = bindInferCurrentTypeRule(ruleSingle, type);
        services.Inference.addInferenceRule(rule, options);
    }
    // In theory, there is a small optimization possible:
    // Register all inference rules (with the same languageKey) within a single generic inference rule (in order to keep the number of "global" inference rules small)
}
