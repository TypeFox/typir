/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import type { Type } from '../graph/type-node.js';
import { isType } from '../graph/type-node.js';
import type { TypeInitializer } from '../initialization/type-initializer.js';
import type {
    TypeInferenceRule,
    TypeInferenceRuleOptions,
} from '../services/inference.js';
import { InferenceRuleNotApplicable } from '../services/inference.js';
import type {
    ValidationProblemAcceptor,
    ValidationRule,
    ValidationRuleOptions,
} from '../services/validation.js';
import type { TypirServices } from '../typir.js';
import { toArray } from './utils.js';

/**
 * Common interface of all problems/errors/messages which should be shown to users of DSLs which are type-checked with Typir.
 * This approach makes it easier to introduce additional errors by users of Typir, compared to a union type, e.g. export type TypirProblem = ValueConflict | IndexedTypeConflict | ...
 */
export interface TypirProblem {
    readonly $problem: string;
}
export function isSpecificTypirProblem(
    problem: unknown,
    $problem: string,
): problem is TypirProblem {
    return (
        typeof problem === 'object' &&
        problem !== null &&
        (problem as TypirProblem).$problem === $problem
    );
}

export type Types = Type | Type[];
export type Names = string | string[];
export type TypeInitializers<T extends Type, LanguageType> =
    | TypeInitializer<T, LanguageType>
    | Array<TypeInitializer<T, LanguageType>>;

export type NameTypePair = {
    name: string;
    type: Type;
};
export function isNameTypePair(type: unknown): type is NameTypePair {
    return (
        typeof type === 'object' &&
        type !== null &&
        typeof (type as NameTypePair).name === 'string' &&
        isType((type as NameTypePair).type)
    );
}

//
// Utilities for validations
//

/** A pair of a rule for type inference with its additional options. */
export interface ValidationRuleWithOptions<
    LanguageType,
    T extends LanguageType = LanguageType,
> {
    rule: ValidationRule<LanguageType, T>;
    options: Partial<ValidationRuleOptions>;
}

export function bindValidateCurrentTypeRule<
    TypeType extends Type,
    LanguageType,
    T extends LanguageType = LanguageType,
>(
    rule: InferCurrentTypeRule<TypeType, LanguageType, T>,
    type: TypeType,
): ValidationRuleWithOptions<LanguageType, T> | undefined {
    // check the given rule
    checkRule(rule); // fail early
    if (toArray(rule.validation).length <= 0) {
        // there are no checks => don't create a validation rule!
        return undefined;
    }
    // create a single validation rule with options
    // (This is more efficient than having one validation rule for each check, since 'filter' and 'match' are checked multiple times in that case.)
    return {
        rule: (languageNode, accept, typir) => {
            // when this validation rule is executed, it is already ensured, that the (non-undefined) language key of rule and language node fit!
            if (
                rule.filter !== undefined &&
                rule.filter(languageNode) === false
            ) {
                return; // if specified, the filter needs to accept the current language node
            }
            if (
                rule.matching !== undefined &&
                rule.matching(languageNode, type) === false
            ) {
                return; // if specified, the current language node needs to match the condition of the inference rule
            }
            // since the current language node fits to this inference rule, validate it according
            for (const validationRule of toArray(rule.validation)) {
                validationRule(languageNode, type, accept, typir);
            }
        },
        options: {
            languageKey: rule.languageKey,
            boundToType: type,
        },
    };
}

/**
 * These options are used for pre-defined valiations in order to enable the user to decide,
 * how the created pre-defined valiation should be registered.
 */
export interface RegistrationOptions {
    /**
     * 'MYSELF' indicates, that the caller is responsible to register the validation rule,
     * otherwise the given options are used to register the return validation rule now.
     */
    registration: 'MYSELF' | Partial<ValidationRuleOptions>;
}

//
// Utilities for type inference
//

/** A pair of a rule for type inference with its additional options. */
export interface InferenceRuleWithOptions<
    LanguageType,
    T extends LanguageType = LanguageType,
> {
    rule: TypeInferenceRule<LanguageType, T>;
    options: Partial<TypeInferenceRuleOptions>;
}

export function optionsBoundToType<
    T extends
        | Partial<TypeInferenceRuleOptions>
        | Partial<ValidationRuleOptions>,
>(options: T, type: Type | undefined): T {
    return {
        ...options,
        boundToType: type,
    };
}

export function ruleWithOptionsBoundToType<
    LanguageType,
    T extends LanguageType = LanguageType,
>(
    rule: InferenceRuleWithOptions<LanguageType, T>,
    type: Type | undefined,
): InferenceRuleWithOptions<LanguageType, T> {
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
export interface InferCurrentTypeRule<
    TypeType extends Type,
    LanguageType,
    T extends LanguageType = LanguageType,
> {
    languageKey?: string | string[];
    filter?: (languageNode: LanguageType) => languageNode is T;
    matching?: (languageNode: T, typeToInfer: TypeType) => boolean;

    /**
     * This validation will be applied to all language nodes for which the current type is inferred according to this inference rule.
     * This validation is specific for this inference rule and this inferred type.
     */
    validation?:
        | InferCurrentTypeValidationRule<TypeType, LanguageType, T>
        | Array<InferCurrentTypeValidationRule<TypeType, LanguageType, T>>;
}

export type InferCurrentTypeValidationRule<
    TypeType extends Type,
    LanguageType,
    T extends LanguageType = LanguageType,
> = (
    languageNode: T,
    inferredType: TypeType,
    accept: ValidationProblemAcceptor<LanguageType>,
    typir: TypirServices<LanguageType>,
) => void;

function checkRule<
    TypeType extends Type,
    LanguageType,
    T extends LanguageType = LanguageType,
>(rule: InferCurrentTypeRule<TypeType, LanguageType, T>): void {
    if (
        rule.languageKey === undefined &&
        rule.filter === undefined &&
        rule.matching === undefined
    ) {
        throw new Error(
            'This inference rule has none of the properties "languageKey", "filter" and "matching" at all and therefore cannot infer any type!',
        );
    }
}

export function bindInferCurrentTypeRule<
    TypeType extends Type,
    LanguageType,
    T extends LanguageType = LanguageType,
>(
    rule: InferCurrentTypeRule<TypeType, LanguageType, T>,
    type: TypeType,
): InferenceRuleWithOptions<LanguageType, T> {
    checkRule(rule); // fail early
    return {
        rule: (languageNode, _typir) => {
            // when this inference rule is executed, it is already ensured, that the (non-undefined) language key of rule and language node fit!
            if (rule.filter !== undefined) {
                if (rule.filter(languageNode)) {
                    if (rule.matching !== undefined) {
                        if (rule.matching(languageNode, type)) {
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
                if (rule.matching(languageNode as T, type)) {
                    return type;
                } else {
                    return InferenceRuleNotApplicable; // TODO or an InferenceProblem?
                }
            }
            // Usually the 'languageKey' will be used only to register the inference rule, not during its execution. Therefore it is checked only here at the end:
            if (rule.languageKey !== undefined) {
                return type; // sometimes it is enough to filter only by the language key, e.g. in case of dedicated "IntegerLiteral"s which always have an "Integer" type
            } else {
                throw new Error(
                    'This inference rule has none of the properties "languageKey", "filter" and "matching" at all and therefore cannot infer any type!',
                );
            }
        },
        options: {
            languageKey: rule.languageKey,
            boundToType: type,
        },
    };
}

export function registerInferCurrentTypeRules<
    TypeType extends Type,
    LanguageType,
>(
    rules:
        | InferCurrentTypeRule<TypeType, LanguageType>
        | Array<InferCurrentTypeRule<TypeType, LanguageType>>
        | undefined,
    type: TypeType,
    services: TypirServices<LanguageType>,
): void {
    for (const ruleSingle of toArray(rules)) {
        // inference
        const { rule: ruleInfer, options: optionsInfer } =
            bindInferCurrentTypeRule(ruleSingle, type);
        services.Inference.addInferenceRule(ruleInfer, optionsInfer);
        // validation
        const validate = bindValidateCurrentTypeRule(ruleSingle, type);
        if (validate) {
            services.validation.Collector.addValidationRule(
                validate.rule,
                validate.options,
            );
        }
    }
    // In theory, there is a small performance optimization possible:
    // Register all inference rules (with the same languageKey) within a single generic inference rule (in order to keep the number of "global" inference rules small)
}
