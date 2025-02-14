/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type } from '../../graph/type-node.js';
import { AssignabilitySuccess, isAssignabilityProblem } from '../../services/assignability.js';
import { TypeInferenceRuleWithInferringChildren, InferenceRuleNotApplicable, InferenceProblem } from '../../services/inference.js';
import { TypirServices } from '../../typir.js';
import { checkTypeArrays } from '../../utils/utils-type-comparison.js';
import { FunctionTypeDetails, InferFunctionCall, OverloadedFunctionDetails } from './function-kind.js';
import { FunctionType } from './function-type.js';

/**
 * Dedicated inference rule for calls of a single function signature.
 * It ensures, that all parameters match, and provides information, how parameters are matching ('assignabilitySuccess').
 *
 * Note: If multiple inference rules are configured for the same FunctionType, for each of these inference rules one instance of 'FunctionCallInferenceRule' is created,
 * since these inference rules are independent from each other (and only return the same FunctionType).
 *
 * Preconditions:
 * - there is a rule which specifies how to infer the current function type
 * - the current function has an output type/parameter, otherwise, this function could not provide any type (and throws an error), when it is called!
 *   (exception: the options contain a type to return in this special case)
 */
export class FunctionCallInferenceRule<T> implements TypeInferenceRuleWithInferringChildren {
    protected readonly typeDetails: FunctionTypeDetails;
    protected readonly inferenceRuleForCalls: InferFunctionCall<T>;
    protected readonly functionType: FunctionType;
    protected readonly mapNameTypes: Map<string, OverloadedFunctionDetails>;
    assignabilitySuccess: Array<AssignabilitySuccess | undefined>;

    constructor(typeDetails: FunctionTypeDetails, inferenceRuleForCalls: InferFunctionCall<T>, functionType: FunctionType, mapNameTypes: Map<string, OverloadedFunctionDetails>) {
        this.typeDetails = typeDetails;
        this.inferenceRuleForCalls = inferenceRuleForCalls;
        this.functionType = functionType;
        this.mapNameTypes = mapNameTypes;
        this.assignabilitySuccess = new Array(typeDetails.inputParameters.length);
    }

    inferTypeWithoutChildren(languageNode: unknown, _typir: TypirServices): unknown {
        this.assignabilitySuccess.fill(undefined); // reset the entries
        // 1. Does the filter of the inference rule accept the current language node?
        const result = this.inferenceRuleForCalls.filter === undefined || this.inferenceRuleForCalls.filter(languageNode);
        if (!result) {
            // the language node has a completely different purpose
            return InferenceRuleNotApplicable;
        }
        // 2. Does the inference rule match this language node?
        const matching = this.inferenceRuleForCalls.matching === undefined || this.inferenceRuleForCalls.matching(languageNode as T);
        if (!matching) {
            // the language node is slightly different
            return InferenceRuleNotApplicable;
        }
        // 3. Check whether the current arguments fit to the expected parameter types
        const inputArguments = this.inferenceRuleForCalls.inputArguments(languageNode as T);
        if (inputArguments.length <= 0) {
            // there are no operands to check
            return this.check(this.getOutputTypeForFunctionCalls());
        }
        // at least one operand => this function type might match, to be sure, resolve the types of the values for the parameters
        const overloadInfos = this.mapNameTypes.get(this.typeDetails.functionName);
        if (overloadInfos === undefined || overloadInfos.overloadedFunctions.length <= 1) {
            // the current function is not overloaded, therefore, the types of their parameters are not required => save time, ignore inference errors
            return this.check(this.getOutputTypeForFunctionCalls());
        }
        // two or more overloaded functions
        if (overloadInfos.sameOutputType) {
            // exception: all(!) overloaded functions have the same(!) output type, save performance and return this type!
            return overloadInfos.sameOutputType;
        }
        // the types of the parameters need to be inferred in order to determine an exact match
        return inputArguments;
    }

    inferTypeWithChildrensTypes(languageNode: unknown, actualInputTypes: Array<Type | undefined>, typir: TypirServices): Type | InferenceProblem {
        const expectedInputTypes = this.typeDetails.inputParameters.map(p => typir.infrastructure.TypeResolver.resolve(p.type));
        // all operands need to be assignable(! not equal) to the required types
        const comparisonConflicts = checkTypeArrays(
            actualInputTypes,
            expectedInputTypes,
            (t1, t2, index) => {
                const result = typir.Assignability.getAssignabilityResult(t1, t2);
                if (isAssignabilityProblem(result)) {
                    return result;
                } else {
                    // save the information equal/conversion/subtype for deciding "conflicts" of overloaded functions
                    this.assignabilitySuccess[index] = result;
                    return undefined;
                }
            },
            true,
        );
        if (comparisonConflicts.length >= 1) {
            // this function type does not match, due to assignability conflicts => return them as errors
            return {
                $problem: InferenceProblem,
                languageNode: languageNode,
                inferenceCandidate: this.functionType,
                location: 'input parameters',
                rule: this,
                subProblems: comparisonConflicts,
            };
            // We have a dedicated validation for this case (see below), but a resulting error might be ignored by the user => return the problem during type-inference again
        } else {
            // matching => return the return type of the function for the case of a function call!
            return this.check(this.getOutputTypeForFunctionCalls());
        }
    }

    protected getOutputTypeForFunctionCalls(): Type | undefined {
        return this.functionType.kind.getOutputTypeForFunctionCalls(this.functionType);
    }

    protected check(returnType: Type | undefined): Type {
        if (returnType) { // this condition is checked here, since 'undefined' is OK, as long as it is not used; extracting this function is difficult due to TypeScripts strict rules for using 'this'
            return returnType;
        } else {
            throw new Error(`The function ${this.typeDetails.functionName} is called, but has no output type to infer.`);
        }
    }
}
