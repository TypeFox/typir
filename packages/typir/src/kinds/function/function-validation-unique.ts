/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { ValidationProblem, ValidationRuleWithBeforeAfter } from '../../services/validation.js';
import { TypirServices } from '../../typir.js';
import { isFunctionType, FunctionType } from './function-type.js';

/**
 * Predefined validation to produce errors for those (overloaded) functions which cannot be distinguished when calling them.
 * By default, only the name and the types of the input parameters are used to distinguish functions.
 */
export class UniqueFunctionValidation<LanguageType = unknown> implements ValidationRuleWithBeforeAfter<LanguageType> {
    protected readonly foundDeclarations: Map<string, LanguageType[]> = new Map();
    protected readonly services: TypirServices<LanguageType>;
    /**
     * Use this check to filter language nodes which are relevant for the creation of functions,
     * e.g. ensure that only function declarations are covered and no calls of function which have a function as return type.
     * Beyond that, this check improves performance, since type inference will be done only for the filtered language nodes.
     * Instead of using this filter, the 'language key' to register this validation rules can be exploited for the same purposes.
     */
    protected readonly isRelevant: ((languageNode: LanguageType) => boolean) | undefined;

    constructor(services: TypirServices<LanguageType>, isRelevant?: (languageNode: LanguageType) => boolean) {
        this.services = services;
        this.isRelevant = isRelevant;
    }

    beforeValidation(_languageRoot: LanguageType, _typir: TypirServices<LanguageType>): Array<ValidationProblem<LanguageType>> {
        this.foundDeclarations.clear();
        return [];
    }

    validation(languageNode: LanguageType, _typir: TypirServices<LanguageType>): Array<ValidationProblem<LanguageType>> {
        if (this.isRelevant === undefined || this.isRelevant(languageNode)) { // improves performance, since type inference need to be done only for relevant language nodes
            const type = this.services.Inference.inferType(languageNode);
            if (isFunctionType(type)) {
                // register language nodes which have FunctionTypes with a key for their uniqueness
                const key = this.calculateFunctionKey(type);
                let entries = this.foundDeclarations.get(key);
                if (!entries) {
                    entries = [];
                    this.foundDeclarations.set(key, entries);
                }
                entries.push(languageNode);
            }
        }
        return [];
    }

    /**
     * Calculates a key for a function which encodes its unique properties, i.e. duplicate functions have the same key.
     * This key is used to identify duplicated functions.
     * Override this method to change the properties which make a function unique.
     * By default, only the name and the types of the input parameters are relevant.
     * @param func the current function type
     * @returns a string key
     */
    protected calculateFunctionKey(func: FunctionType): string {
        return `${func.functionName}(${func.getInputs().map(param => param.type.getIdentifier())})`;
    }

    afterValidation(_languageRoot: LanguageType, _typir: TypirServices<LanguageType>): Array<ValidationProblem<LanguageType>> {
        const result: Array<ValidationProblem<LanguageType>> = [];
        for (const [key, functions] of this.foundDeclarations.entries()) {
            if (functions.length >= 2) {
                for (const func of functions) {
                    result.push({
                        $problem: ValidationProblem,
                        languageNode: func,
                        severity: 'error',
                        message: `Declared functions need to be unique (${key}).`,
                    });
                }
            }
        }

        this.foundDeclarations.clear();
        return result;
    }
}
