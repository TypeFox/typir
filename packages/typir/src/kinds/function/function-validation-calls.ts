/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
******************************************************************************/

import { ValidationProblem, ValidationRuleStateless } from '../../services/validation.js';
import { checkTypes, checkValueForConflict, createTypeCheckStrategy, TypeToCheck } from '../../utils/utils-type-comparison.js';
import { assertUnreachable } from '../../utils/utils.js';
import { FunctionKind, InferFunctionCall } from './function-kind.js';

// TODO LanguageKeys: außerhalb + innerhalb; muss dies hier eine Composite-Validation-Rule sein??
// TODO ValidationRuleStateless doch als Objekt realisieren für leichtere Implementierung eines Interfaces? (gleiches gilt für InferenceRuleWithoutChildren!)
// TODO "description"-Property für leichteres Debugging, Error messages usw. nutzen?
export function createFunctionCallArgumentsValidation<LanguageType = unknown>(kind: FunctionKind<LanguageType>): ValidationRuleStateless<LanguageType> {
    return (languageNode, accept, typir) => {
        const languageKey = typir.Language.getLanguageNodeKey(languageNode);
        // for each (overloaded) function
        for (const [overloadedName, overloadedFunctions] of kind.mapNameTypes.entries()) {
            const resultOverloaded: Array<ValidationProblem<LanguageType>> = [];
            const isOverloaded = overloadedFunctions.overloadedFunctions.length >= 2;
            // for each single function/variant
            for (const singleFunction of overloadedFunctions.overloadedFunctions) {
                const inferenceRule = singleFunction.inferenceRuleForCalls;
                if (languageKey !== inferenceRule.languageKey && inferenceRule.languageKey !== undefined) {
                    continue; // rule does not match at all => no constraints apply here => no error to show here
                }
                if (inferenceRule.filter !== undefined && inferenceRule.filter(languageNode) === false) {
                    continue; // rule does not match at all => no constraints apply here => no error to show here
                }
                if (inferenceRule.matching !== undefined && inferenceRule.matching(languageNode) === false) {
                    continue; // false => does slightly not match => no constraints apply here => no error to show here
                }
                // Now, check that the given arguments fit to the expected parameters and collect all problems
                const currentProblems: Array<ValidationProblem<LanguageType>> = [];
                const inputArguments = inferenceRule.inputArguments(languageNode);
                const expectedParameterTypes = singleFunction.functionType.getInputs();
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
                    const inferredParameterTypes = inputArguments.map(p => typir.Inference.inferType(p));
                    for (let i = 0; i < inputArguments.length; i++) {
                        const expectedType = expectedParameterTypes[i];
                        const inferredType = inferredParameterTypes[i];
                        const parameterProblems = checkTypes(inferredType as TypeToCheck, expectedType, createTypeCheckStrategy('ASSIGNABLE_TYPE', typir), true);
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
                    if (validateArgumentsOfFunctionCalls(singleFunction.inferenceRuleForCalls, languageNode)) {
                        resultOverloaded.push({
                            $problem: ValidationProblem,
                            languageNode: languageNode,
                            severity: 'error',
                            message: `The given operands for the function '${typir.Printer.printTypeName(singleFunction.functionType)}' match the expected types only partially.`,
                            subProblems: currentProblems,
                        });
                    } else {
                        // ignore this variant for validation
                    }
                } else {
                    return; // 100% match found => there are no validation hints to show!
                }
            }
            if (resultOverloaded.length >= 1) {
                if (isOverloaded) {
                    accept({
                        $problem: ValidationProblem,
                        languageNode: languageNode,
                        severity: 'error',
                        message: `The given operands for the overloaded '${overloadedName}' match the expected types only partially.`,
                        subProblems: resultOverloaded,
                    });
                } else {
                    resultOverloaded.forEach(p => accept(p));
                }
            }
        }
    };
}

function validateArgumentsOfFunctionCalls<LanguageType = unknown>(rule: InferFunctionCall<LanguageType>, languageNode: LanguageType): boolean {
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
