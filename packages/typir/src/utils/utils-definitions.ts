/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/indent */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { isType, Type } from '../graph/type-node.js';
import { TypeInitializer } from '../initialization/type-initializer.js';
import { InferenceRuleNotApplicable, TypeInferenceRule, TypeInferenceRuleOptions } from '../services/inference.js';
import { ValidationProblemAcceptor, ValidationRule, ValidationRuleOptions } from '../services/validation.js';
import { TypirSpecifics, TypirServices } from '../typir.js';
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
export type TypeInitializers<T extends Type, Specifics extends TypirSpecifics> = TypeInitializer<T, Specifics> | Array<TypeInitializer<T, Specifics>>;

export type NameTypePair = {
    name: string;
    type: Type;
}
export function isNameTypePair(type: unknown): type is NameTypePair {
    return typeof type === 'object' && type !== null && typeof (type as NameTypePair).name === 'string' && isType((type as NameTypePair).type);
}



//
// Utilities for validations
//

/** A pair of a rule for type inference with its additional options. */
export interface ValidationRuleWithOptions<Specifics extends TypirSpecifics, T extends Specifics['LanguageType'] = Specifics['LanguageType']> {
    rule: ValidationRule<Specifics, T>;
    options: Partial<ValidationRuleOptions<Specifics>>;
}

export function bindValidateCurrentTypeRule<
    TypeType extends Type,
    Specifics extends TypirSpecifics,
    LanguageKey extends LanguageKeys<Specifics> = undefined,
    LanguageType extends LanguageTypeOfLanguageKey<Specifics, LanguageKey> = LanguageTypeOfLanguageKey<Specifics, LanguageKey>
>(
    rule: InferCurrentTypeRule<TypeType, Specifics, LanguageKey, LanguageType>, type: TypeType
): ValidationRuleWithOptions<Specifics, LanguageType> | undefined {
    // check the given rule
    checkRule(rule); // fail early
    if (toArray(rule.validation).length <= 0) { // there are no checks => don't create a validation rule!
        return undefined;
    }
    // create a single validation rule with options
    // (This is more efficient than having one validation rule for each check, since 'filter' and 'match' are checked multiple times in that case.)
    return {
        rule: (languageNode, accept, typir) => {
            // when this validation rule is executed, it is already ensured, that the (non-undefined) language key of rule and language node fit!
            if (rule.filter !== undefined && rule.filter(languageNode) === false) {
                return; // if specified, the filter needs to accept the current language node
            }
            if (rule.matching !== undefined && rule.matching(languageNode, type) === false) {
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
        }
    };
}


/**
 * These options are used for pre-defined valiations in order to enable the user to decide,
 * how the created pre-defined valiation should be registered.
 */
export interface RegistrationOptions<Specifics extends TypirSpecifics> {
    /**
     * 'MYSELF' indicates, that the caller is responsible to register the validation rule,
     * otherwise the given options are used to register the return validation rule now.
     */
    registration: 'MYSELF' | Partial<ValidationRuleOptions<Specifics>>;
}


//
// Utilities for type inference
//

/** A pair of a rule for type inference with its additional options. */
export interface InferenceRuleWithOptions<Specifics extends TypirSpecifics, T extends Specifics['LanguageType'] = Specifics['LanguageType']> {
    rule: TypeInferenceRule<Specifics, T>;
    options: Partial<TypeInferenceRuleOptions<Specifics>>;
}

export function inferenceOptionsBoundToType<Specifics extends TypirSpecifics, T extends Partial<TypeInferenceRuleOptions<Specifics>> = Partial<TypeInferenceRuleOptions<Specifics>>>(options: T, type: Type | undefined): T {
    return {
        ...options,
        boundToType: type,
    };
}

export type LanguageKey<Specifics extends TypirSpecifics> = keyof Specifics['LanguageKeys'];
export type LanguageKeys<Specifics extends TypirSpecifics> = LanguageKey<Specifics> | Array<LanguageKey<Specifics>> | undefined;
export type LanguageTypeOfLanguageKey<
    Specifics extends TypirSpecifics,
    Keys extends LanguageKeys<Specifics>
> =
    Keys extends undefined ? Specifics['LanguageType'] : // no key => use the base language type
    Keys extends keyof Specifics['LanguageKeys'] ? Specifics['LanguageKeys'][Keys] : // single key => use the specified language type from the "list type"
    Keys extends Array<infer GivenKeys> ? Specifics['LanguageType'] : // multiple keys => use the base language type as fall-back; TODO is it possible to improve this with a union of the GivenKeys?
    never;

/**
 * An inference rule which is dedicated for inferrring a certain type.
 * This utility type is often used for inference rules which are annotated to the declaration of a type.
 * At least one of the properties needs to be specified.
 */
export interface InferCurrentTypeRule<
    TypeType extends Type, // TODO rename "TypeType" to "CurrentType"?
    Specifics extends TypirSpecifics,
    LanguageKey extends LanguageKeys<Specifics> = undefined,
    LanguageType extends LanguageTypeOfLanguageKey<Specifics, LanguageKey> = LanguageTypeOfLanguageKey<Specifics, LanguageKey>,
> {
    languageKey?: LanguageKey;
    filter?: (languageNode: LanguageTypeOfLanguageKey<Specifics, LanguageKey>) => languageNode is LanguageType;
    matching?: (languageNode: LanguageType, typeToInfer: TypeType) => boolean;

    /**
     * This validation will be applied to all language nodes for which the current type is inferred according to this inference rule.
     * This validation is specific for this inference rule and this inferred type.
     */
    validation?: InferCurrentTypeValidationRule<TypeType, Specifics, LanguageType> | Array<InferCurrentTypeValidationRule<TypeType, Specifics, LanguageType>>;

    skipThisRuleIfThisTypeAlreadyExists?: boolean | ((existingType: TypeType) => boolean); // default is false
}

export type InferCurrentTypeValidationRule<
    TypeType extends Type,
    Specifics extends TypirSpecifics,
    T extends Specifics['LanguageType'] = Specifics['LanguageType'],
> =
    (languageNode: T, inferredType: TypeType, accept: ValidationProblemAcceptor<Specifics>, typir: TypirServices<Specifics>) => void;


export function skipInferenceRuleForExistingType<
    TypeType extends Type,
    Specifics extends TypirSpecifics,
    LanguageKey extends LanguageKeys<Specifics> = undefined,
    LanguageType extends LanguageTypeOfLanguageKey<Specifics, LanguageKey> = LanguageTypeOfLanguageKey<Specifics, LanguageKey>
>(
    inferenceRule: InferCurrentTypeRule<TypeType, Specifics, LanguageKey, LanguageType>, newType: TypeType, existingType: TypeType
): boolean {
    if (newType !== existingType) {
        const skipRuleForExisting = inferenceRule.skipThisRuleIfThisTypeAlreadyExists;
        // don't create (additional) rules for the already existing type
        return skipRuleForExisting === true || (typeof skipRuleForExisting === 'function' && skipRuleForExisting(existingType) === true);
    }
    return false;
}

function checkRule<
    TypeType extends Type,
    Specifics extends TypirSpecifics,
    LanguageKey extends LanguageKeys<Specifics> = undefined,
    LanguageType extends LanguageTypeOfLanguageKey<Specifics, LanguageKey> = LanguageTypeOfLanguageKey<Specifics, LanguageKey>
>(
    rule: InferCurrentTypeRule<TypeType, Specifics, LanguageKey, LanguageType>
): void {
    if (rule.languageKey === undefined && rule.filter === undefined && rule.matching === undefined) {
        throw new Error('This inference rule has none of the properties "languageKey", "filter" and "matching" at all and therefore cannot infer any type!');
    }
}

export function bindInferCurrentTypeRule<
    TypeType extends Type,
    Specifics extends TypirSpecifics,
    LanguageKey extends LanguageKeys<Specifics> = undefined,
    LanguageType extends LanguageTypeOfLanguageKey<Specifics, LanguageKey> = LanguageTypeOfLanguageKey<Specifics, LanguageKey>
>(
    rule: InferCurrentTypeRule<TypeType, Specifics, LanguageKey, LanguageType>, type: TypeType
): InferenceRuleWithOptions<Specifics, LanguageType> {
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
                if (rule.matching(languageNode as LanguageType, type)) {
                    return type;
                } else {
                    return InferenceRuleNotApplicable; // TODO or an InferenceProblem?
                }
            }
            // Usually the 'languageKey' will be used only to register the inference rule, not during its execution. Therefore it is checked only here at the end:
            if (rule.languageKey !== undefined) {
                return type; // sometimes it is enough to filter only by the language key, e.g. in case of dedicated "IntegerLiteral"s which always have an "Integer" type
            } else {
                throw new Error('This inference rule has none of the properties "languageKey", "filter" and "matching" at all and therefore cannot infer any type!');
            }
        },
        options: {
            languageKey: rule.languageKey,
            boundToType: type,
        }
    };
}

export function registerInferCurrentTypeRules<TypeType extends Type, Specifics extends TypirSpecifics>(
    rules: InferCurrentTypeRule<TypeType, Specifics> | Array<InferCurrentTypeRule<TypeType, Specifics>> | undefined, type: TypeType, services: TypirServices<Specifics>
): void {
    for (const ruleSingle of toArray(rules)) {
        // inference
        const {rule: ruleInfer, options: optionsInfer} = bindInferCurrentTypeRule(ruleSingle, type);
        services.Inference.addInferenceRule(ruleInfer, optionsInfer);
        // validation
        const validate = bindValidateCurrentTypeRule(ruleSingle, type);
        if (validate) {
            services.validation.Collector.addValidationRule(validate.rule, validate.options);
        }
    }
    // In theory, there is a small performance optimization possible:
    // Register all inference rules (with the same languageKey) within a single generic inference rule (in order to keep the number of "global" inference rules small)
}
