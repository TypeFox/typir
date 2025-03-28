/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
******************************************************************************/

import { ValidationProblem, ValidationProblemAcceptor, ValidationRuleLifecycle } from '../../services/validation.js';
import { TypirServices } from '../../typir.js';
import { RuleCollectorListener, RuleOptions } from '../../utils/rule-registration.js';
import { checkTypes, checkValueForConflict, createTypeCheckStrategy } from '../../utils/utils-type-comparison.js';
import { assertUnreachable, toArray } from '../../utils/utils.js';
import { InferFunctionCall } from './function-kind.js';
import { AvailableFunctionsManager, SingleFunctionDetails } from './function-overloading.js';

/**
 * This validation uses the inference rules for all available function calls to check, whether ...
 * - the given arguments for a function call fit to one of the defined function signature
 * - and validates this call according to the specific validation rules for this function call.
 * There is only one instance of this class for each function kind/manager.
 */
export class FunctionCallArgumentsValidation<LanguageType> implements ValidationRuleLifecycle<LanguageType>, RuleCollectorListener<SingleFunctionDetails<LanguageType>> {
    protected readonly services: TypirServices<LanguageType>;
    readonly functions: AvailableFunctionsManager<LanguageType>;

    constructor(services: TypirServices<LanguageType>, functions: AvailableFunctionsManager<LanguageType>) {
        this.services = services;
        this.functions = functions;
    }

    onAddedRule(_rule: SingleFunctionDetails<LanguageType, LanguageType>, diffOptions: RuleOptions): void {
        // this rule needs to be registered also for all the language keys of the new inner function call rule
        this.services.validation.Collector.addValidationRule(this, {
            ...diffOptions,
            boundToType: undefined,
        });
    }

    onRemovedRule(_rule: SingleFunctionDetails<LanguageType, LanguageType>, diffOptions: RuleOptions): void {
        // remove this "composite" rule for all language keys for which no function call rules are registered anymore
        if (diffOptions.languageKey === undefined) {
            if (this.noFunctionCallRulesForThisLanguageKey(undefined)) {
                this.services.validation.Collector.removeValidationRule(this, {
                    ...diffOptions,
                    languageKey: undefined,
                    boundToType: undefined, // this rule is never bound to a type, since this rule is global
                });
            }
        } else {
            const languageKeysToUnregister = toArray(diffOptions.languageKey).filter(key => this.noFunctionCallRulesForThisLanguageKey(key));
            this.services.validation.Collector.removeValidationRule(this, {
                ...diffOptions,
                languageKey: languageKeysToUnregister,
                boundToType: undefined, // this rule is never bound to a type, since this rule is global
            });
        }
    }

    protected noFunctionCallRulesForThisLanguageKey(key: undefined | string): boolean {
        for (const overloads of this.functions.getAllOverloads()) {
            if (overloads[1].details.getRulesByLanguageKey(key).length >= 1) {
                return false;
            }
        }
        return true;
    }

    validation(languageNode: LanguageType, accept: ValidationProblemAcceptor<LanguageType>, _typir: TypirServices<LanguageType>): void {
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
        const alreadyExecutedRules: Set<InferFunctionCall<LanguageType>> = new Set();
        // for each (overloaded) function
        for (const [overloadedName, overloadedFunctions] of this.functions.getAllOverloads()) { // this grouping is not required here (but for other use cases) and does not hurt here
            const resultOverloaded: Array<ValidationProblem<LanguageType>> = [];
            // for each language key
            for (const key of keysToApply) {
                for (const singleFunction of overloadedFunctions.details.getRulesByLanguageKey(key)) {
                    if (alreadyExecutedRules.has(singleFunction.inferenceRuleForCalls)) { // TODO funktioniert das überhaupt, sprich: wird immer ein neues Objekt erstellt oder das aus der Konfiguration durchgereicht? zumindestens für Operatoren
                        // don't execute rules multiple times, if they are associated with multiple keys (with overlapping sub-keys)
                    } else {
                        const exactMatch = this.executeSingleRule(singleFunction, languageNode, resultOverloaded);
                        if (exactMatch) {
                            // found exact match => execute the validation rules which are specific for this function call ...
                            for (const specificValidation of toArray(singleFunction.inferenceRuleForCalls.validation)) {
                                specificValidation.call(specificValidation, languageNode, singleFunction.functionType, accept, this.services);
                            }
                            return; // ... and ignore the other function call rules
                        }
                        alreadyExecutedRules.add(singleFunction.inferenceRuleForCalls);
                    }
                }
            }
            // Since none of the function signatures match, report one validation issue (with sub-problems) for each function signature (and for each language key)
            if (resultOverloaded.length >= 1) {
                accept({
                    languageNode: languageNode,
                    severity: 'error',
                    message: `The given operands for the call of ${overloadedFunctions.overloadedFunctions.length >= 2 ? 'the overload ' : ''}'${overloadedName}' don't match.`,
                    subProblems: resultOverloaded,
                });
            }
        }
    }

    /**
     * Checks whether the given inference rule for function calls matches the given language node.
     * @param singleFunction the current function and its inference rule for calls of it
     * @param languageNode the current language node, which might or might not represent a function call
     * @param resultOverloaded receives a validation issue, if there is at least one conflict between given arguments and expected parameters
     * @returns true, if the given function signature exactly matches the current function call, false otherwise
    */
    protected executeSingleRule(singleFunction: SingleFunctionDetails<LanguageType>, languageNode: LanguageType, resultOverloaded: Array<ValidationProblem<LanguageType>>): boolean {
        const inferenceRule = singleFunction.inferenceRuleForCalls;
        const functionType = singleFunction.functionType;
        if (inferenceRule.filter !== undefined && inferenceRule.filter(languageNode) === false) {
            return false; // rule does not match at all => no constraints apply here => no error to show here
        }
        if (inferenceRule.matching !== undefined && inferenceRule.matching(languageNode, functionType) === false) {
            return false; // false => does slightly not match => no constraints apply here => no error to show here
        }

        // Now, check that the given arguments fit to the expected parameters and collect all problems
        // (Since the arguments should be validated, it is no option to skip the inference of arguments, as it is done as shortcut for the inference!)
        const currentProblems: Array<ValidationProblem<LanguageType>> = [];
        const inputArguments = inferenceRule.inputArguments(languageNode);
        const expectedParameterTypes = functionType.getInputs();
        // check, that the given number of parameters is the same as the expected number of input parameters
        const parameterLength = checkValueForConflict(expectedParameterTypes.length, inputArguments.length, 'number of input parameter values');
        if (parameterLength.length >= 1) {
            currentProblems.push({
                $problem: ValidationProblem,
                languageNode: languageNode,
                severity: 'error',
                message: 'The number of given parameter values does not match the expected number of input parameters.',
                subProblems: parameterLength,
            });
        } else {
            // compare arguments with their corresponding parameters
            const inferredParameterTypes = inputArguments.map(p => this.services.Inference.inferType(p));
            for (let i = 0; i < inputArguments.length; i++) {
                const expectedType = expectedParameterTypes[i];
                const inferredType = inferredParameterTypes[i];
                const parameterProblems = checkTypes(inferredType, expectedType, createTypeCheckStrategy('ASSIGNABLE_TYPE', this.services), true);
                if (parameterProblems.length >= 1) {
                    // the value is not assignable to the type of the input parameter
                    // create one ValidationProblem for each problematic parameter!
                    currentProblems.push({
                        $problem: ValidationProblem,
                        languageNode: inputArguments[i],
                        severity: 'error',
                        message: `The parameter '${expectedType.name}' at index ${i} got a value with a wrong type.`,
                        subProblems: parameterProblems,
                    });
                } else {
                    // this parameter value is fine
                }
            }
        }

        // summarize all parameters of the current function overload/signature
        if (currentProblems.length >= 1) {
            // some problems with parameters => this signature does not match
            if (this.validateArgumentsOfFunctionCalls(inferenceRule, languageNode)) {
                resultOverloaded.push({
                    $problem: ValidationProblem,
                    languageNode: languageNode,
                    severity: 'error',
                    message: `The given arguments don't match the parameters of '${this.services.Printer.printTypeUserRepresentation(functionType)}'.`,
                    subProblems: currentProblems,
                });
            } else {
                // ignore this variant for validation
            }
            return false;
        } else {
            return true; // 100% match found => there are no validation issues to show!
        }
    }

    protected validateArgumentsOfFunctionCalls<LanguageType>(rule: InferFunctionCall<LanguageType>, languageNode: LanguageType): boolean {
        if (rule.validateArgumentsOfFunctionCalls === undefined) {
            return false; // the default value
        } else if (typeof rule.validateArgumentsOfFunctionCalls === 'boolean') {
            return rule.validateArgumentsOfFunctionCalls;
        } else if (typeof rule.validateArgumentsOfFunctionCalls === 'function') {
            return rule.validateArgumentsOfFunctionCalls(languageNode);
        } else {
            assertUnreachable(rule.validateArgumentsOfFunctionCalls);
        }
    }

}
