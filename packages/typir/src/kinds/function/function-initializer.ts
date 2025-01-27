/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { isType, Type, TypeStateListener } from '../../graph/type-node.js';
import { TypeInitializer } from '../../initialization/type-initializer.js';
import { AssignabilitySuccess, isAssignabilityProblem } from '../../services/assignability.js';
import { isConversionEdge } from '../../services/conversion.js';
import { CompositeTypeInferenceRule, InferenceProblem, InferenceRuleNotApplicable, TypeInferenceRule, TypeInferenceRuleWithInferringChildren } from '../../services/inference.js';
import { isSubTypeEdge } from '../../services/subtype.js';
import { ValidationRule } from '../../services/validation.js';
import { TypirServices } from '../../typir.js';
import { checkTypeArrays } from '../../utils/utils-type-comparison.js';
import { assertType, assertUnreachable } from '../../utils/utils.js';
import { CreateFunctionTypeDetails, FunctionKind, OverloadedFunctionDetails } from './function-kind.js';
import { FunctionType, isFunctionType } from './function-type.js';

export class FunctionTypeInitializer<T> extends TypeInitializer<FunctionType> implements TypeStateListener {
    protected readonly typeDetails: CreateFunctionTypeDetails<T>;
    protected readonly kind: FunctionKind;
    protected inferenceRules: FunctionInferenceRules;
    protected initialFunctionType: FunctionType;

    constructor(services: TypirServices, kind: FunctionKind, typeDetails: CreateFunctionTypeDetails<T>) {
        super(services);
        this.typeDetails = typeDetails;
        this.kind = kind;

        const functionName = typeDetails.functionName;

        // check the input
        if (typeDetails.outputParameter === undefined && typeDetails.inferenceRuleForCalls) {
            // no output parameter => no inference rule for calling this function
            throw new Error(`A function '${functionName}' without output parameter cannot have an inferred type, when this function is called!`);
        }
        kind.enforceFunctionName(functionName, kind.options.enforceFunctionName);
        if (typeDetails.validationForCall && typeDetails.inferenceRuleForCalls === undefined) {
            throw new Error(`A function '${functionName}' with validation of its calls need an inference rule which defines these inference calls!`);
        }

        // prepare the overloads
        if (this.kind.mapNameTypes.has(functionName)) {
            // do nothing
        } else {
            const overloaded: OverloadedFunctionDetails = {
                overloadedFunctions: [],
                inference: new OverloadedFunctionsTypeInferenceRule(this.services),
                sameOutputType: undefined,
            };
            this.kind.mapNameTypes.set(functionName, overloaded);
            this.services.Inference.addInferenceRule(overloaded.inference);
        }

        // create the new Function type
        this.initialFunctionType = new FunctionType(kind, typeDetails);

        this.inferenceRules = this.createInferenceRules(typeDetails, this.initialFunctionType);
        this.registerInferenceRules(functionName, undefined);

        this.initialFunctionType.addListener(this, true);
    }

    override getTypeInitial(): FunctionType {
        return this.initialFunctionType;
    }

    onSwitchedToIdentifiable(functionType: Type): void {
        const functionName = this.typeDetails.functionName;
        assertType(functionType, isFunctionType);
        const readyFunctionType = this.producedType(functionType);
        if (readyFunctionType !== functionType) {
            functionType.removeListener(this);
            this.deregisterInferenceRules(functionName, undefined);
            this.inferenceRules = this.createInferenceRules(this.typeDetails, readyFunctionType);
            this.registerInferenceRules(functionName, readyFunctionType);
        } else {
            this.deregisterInferenceRules(functionName, undefined);
            this.registerInferenceRules(functionName, readyFunctionType);
        }

        // remember the new function for later in order to enable overloaded functions!
        // const functionName = typeDetails.functionName;
        const outputTypeForFunctionCalls = this.kind.getOutputTypeForFunctionCalls(readyFunctionType); // output parameter for function calls
        const overloaded = this.kind.mapNameTypes.get(functionName)!;
        if (overloaded.overloadedFunctions.length <= 0) {
            // remember the output type of the first function
            overloaded.sameOutputType = outputTypeForFunctionCalls;
        } else {
            if (overloaded.sameOutputType && outputTypeForFunctionCalls && this.services.Equality.areTypesEqual(overloaded.sameOutputType, outputTypeForFunctionCalls) === true) {
                // the output types of all overloaded functions are the same for now
            } else {
                // there is a difference
                overloaded.sameOutputType = undefined;
            }
        }
        overloaded.overloadedFunctions.push({
            functionType: readyFunctionType,
            inferenceRuleForCalls: this.typeDetails.inferenceRuleForCalls,
        });
    }

    onSwitchedToCompleted(functionType: Type): void {
        functionType.removeListener(this);
    }

    onSwitchedToInvalid(_functionType: Type): void {
        // nothing specific needs to be done for Functions here, since the base implementation takes already care about all relevant stuff
    }

    protected registerInferenceRules(functionName: string, functionType: FunctionType | undefined): void {
        if (this.inferenceRules.inferenceForCall) {
            const overloaded = this.kind.mapNameTypes.get(functionName)!;
            overloaded.inference.addInferenceRule(this.inferenceRules.inferenceForCall, functionType);
        }
        if (this.inferenceRules.validationForCall) {
            this.kind.services.validation.Collector.addValidationRule(this.inferenceRules.validationForCall);
        }
        if (this.inferenceRules.inferenceForDeclaration) {
            this.kind.services.Inference.addInferenceRule(this.inferenceRules.inferenceForDeclaration, functionType);
        }
    }

    protected deregisterInferenceRules(functionName: string, functionType: FunctionType | undefined): void {
        if (this.inferenceRules.inferenceForCall) {
            const overloaded = this.kind.mapNameTypes.get(functionName);
            overloaded?.inference.removeInferenceRule(this.inferenceRules.inferenceForCall, functionType);
        }
        if (this.inferenceRules.validationForCall) {
            this.kind.services.validation.Collector.removeValidationRule(this.inferenceRules.validationForCall);
        }
        if (this.inferenceRules.inferenceForDeclaration) {
            this.kind.services.Inference.removeInferenceRule(this.inferenceRules.inferenceForDeclaration, functionType);
        }
    }

    protected createInferenceRules<T>(typeDetails: CreateFunctionTypeDetails<T>, functionType: FunctionType): FunctionInferenceRules {
        const result: FunctionInferenceRules = {};
        const mapNameTypes = this.kind.mapNameTypes;

        // create inference rule for calls of the new function
        if (typeDetails.inferenceRuleForCalls) {
            result.inferenceForCall = new FunctionCallInferenceRule(typeDetails, functionType, mapNameTypes);
        }

        // create validation for checking the assignability of arguments to input paramters
        if (typeDetails.validationForCall) {
            result.validationForCall = (languageNode, typir) => {
                if (typeDetails.inferenceRuleForCalls!.filter(languageNode) && typeDetails.inferenceRuleForCalls!.matching(languageNode)) {
                    // check the input arguments, required for overloaded functions
                    const inputArguments = typeDetails.inferenceRuleForCalls!.inputArguments(languageNode);
                    if (inputArguments && inputArguments.length >= 1) {
                        // this function type might match, to be sure, resolve the types of the values for the parameters and continue to step 2
                        const overloadInfos = mapNameTypes.get(typeDetails.functionName);
                        if (overloadInfos && overloadInfos.overloadedFunctions.length >= 2) {
                            // for overloaded functions: the types of the parameters need to be inferred in order to determine an exact match
                            // (Note that the short-cut for type inference for function calls, when all overloads return the same output type, does not work here, since the validation here is specific for this single variant!)
                            // This is also the reason, why the inference rule for call is not reused here.)
                            const childTypes: Array<Type | InferenceProblem[]> = inputArguments.map(child => typir.Inference.inferType(child));
                            const actualInputTypes = childTypes.filter(t => isType(t));
                            if (childTypes.length === actualInputTypes.length) {
                                const expectedInputTypes = typeDetails.inputParameters.map(p => typir.infrastructure.TypeResolver.resolve(p.type));
                                // all operands need to be assignable(! not equal) to the required types
                                const comparisonConflicts = checkTypeArrays(actualInputTypes, expectedInputTypes,
                                    (t1, t2) => typir.Assignability.getAssignabilityProblem(t1, t2), true);
                                if (comparisonConflicts.length <= 0) {
                                    // all arguments are assignable to the expected types of the parameters => this function is really called here => validate this call now
                                    return typeDetails.validationForCall!(languageNode, functionType, typir);
                                }
                            } else {
                                // at least one argument could not be inferred
                            }
                        } else {
                            // the current function is not overloaded, therefore, the types of their parameters are not required => save time
                            return typeDetails.validationForCall!(languageNode, functionType, typir);
                        }
                    } else {
                        // there are no operands to check
                        return typeDetails.validationForCall!(languageNode, functionType, typir);
                    }
                }
                return [];
            };
        }

        // create inference rule for the declaration of the new function
        // (regarding overloaded function, for now, it is assumed, that the given inference rule itself is concrete enough to handle overloaded functions itself!)
        if (typeDetails.inferenceRuleForDeclaration) {
            result.inferenceForDeclaration = (languageNode, _typir) => {
                if (typeDetails.inferenceRuleForDeclaration!(languageNode)) {
                    return functionType;
                } else {
                    return InferenceRuleNotApplicable;
                }
            };
        }

        return result;
    }

}

interface FunctionInferenceRules {
    inferenceForCall?: TypeInferenceRule;
    validationForCall?: ValidationRule;
    inferenceForDeclaration?: TypeInferenceRule;
}


/** Preconditions:
 * - there is a rule which specifies how to infer the current function type
 * - the current function has an output type/parameter, otherwise, this function could not provide any type (and throws an error), when it is called!
 *   (exception: the options contain a type to return in this special case)
 */
class FunctionCallInferenceRule<T> implements TypeInferenceRuleWithInferringChildren {
    protected readonly typeDetails: CreateFunctionTypeDetails<T>;
    protected readonly functionType: FunctionType;
    protected readonly mapNameTypes: Map<string, OverloadedFunctionDetails>;
    assignabilitySuccess: Array<AssignabilitySuccess | undefined>;

    constructor(typeDetails: CreateFunctionTypeDetails<T>, functionType: FunctionType, mapNameTypes: Map<string, OverloadedFunctionDetails>) {
        this.typeDetails = typeDetails;
        this.functionType = functionType;
        this.mapNameTypes = mapNameTypes;
        this.assignabilitySuccess = new Array(typeDetails.inputParameters.length);
    }

    inferTypeWithoutChildren(languageNode: unknown, _typir: TypirServices): unknown {
        this.assignabilitySuccess.fill(undefined); // reset the entries
        // 1. Does the filter of the inference rule accept the current language node?
        const result = this.typeDetails.inferenceRuleForCalls!.filter(languageNode);
        if (!result) {
            // the language node has a completely different purpose
            return InferenceRuleNotApplicable;
        }
        // 2. Does the inference rule match this language node?
        const matching = this.typeDetails.inferenceRuleForCalls!.matching(languageNode);
        if (!matching) {
            // the language node is slightly different
            return InferenceRuleNotApplicable;
        }
        // 3. Check whether the current arguments fit to the expected parameter types
        const inputArguments = this.typeDetails.inferenceRuleForCalls!.inputArguments(languageNode);
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


export class OverloadedFunctionsTypeInferenceRule extends CompositeTypeInferenceRule {

    protected override inferTypeLogic(languageNode: unknown): Type | InferenceProblem[] {
        this.checkForError(languageNode);

        // check all rules in order to search for the best-matching rule, not for the first-matching rule
        const matchingOverloads: OverloadedMatch[] = [];
        const collectedInferenceProblems: InferenceProblem[] = [];
        for (const rules of this.inferenceRules.values()) {
            for (const rule of rules) {
                const result = this.executeSingleInferenceRuleLogic(rule, languageNode, collectedInferenceProblems);
                if (result) {
                    matchingOverloads.push({ result, rule: rule as FunctionCallInferenceRule<never> });
                } else {
                    // no result for this inference rule => check the next inference rules
                }
            }
        }

        if (matchingOverloads.length <= 0) {
            // no matches => return all the collected inference problems
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
        } else if (matchingOverloads.length === 1) {
            // single match
            return matchingOverloads[0].result;
        } else {
            // multiple matches => determine the one to return

            // 1. identify and collect the best matches
            const bestMatches: OverloadedMatch[] = [ matchingOverloads[0] ];
            for (let i = 1; i < matchingOverloads.length; i++) {
                const currentMatch = matchingOverloads[i];
                const comparison = this.compareMatchingOverloads(bestMatches[0], currentMatch);
                if (comparison < 0) {
                    // the existing matches are better than the current one => keep the existing best matches
                } else if (comparison > 0) {
                    // the current match is better than the already collect ones => replace the existing best matches by the current one
                    bestMatches.splice(0, bestMatches.length, currentMatch);
                } else {
                    // the current and the existing matches are both good => collect both
                    bestMatches.push(currentMatch);
                }
            }

            // 2. evaluate the remaining best matches
            if (bestMatches.length === 0) {
                // return the single remaining match
                return bestMatches[0].result;
            } else {
                // decide how to deal with multiple best matches
                const result = this.handleMultipleBestMatches(bestMatches);
                if (result) {
                    // return the chosen match
                    return result.result;
                } else {
                    // no decision => inference is not possible
                    return [{
                        $problem: InferenceProblem,
                        languageNode: languageNode,
                        location: `Found ${bestMatches.length} best matching overloads: ${bestMatches.map(m => m.result.getIdentifier()).join(', ')}`,
                        subProblems: [], // there are no real sub-problems, since the relevant overloads match ...
                    }];
                }
            }
        }
    }

    protected handleMultipleBestMatches(matchingOverloads: OverloadedMatch[]): OverloadedMatch | undefined {
        return matchingOverloads[0]; // by default, return the 1st best match
    }

    // better matches are at the beginning of the list, i.e. better matches get values lower than zero
    protected compareMatchingOverloads(match1: OverloadedMatch, match2: OverloadedMatch): number {
        const cost1 = this.calculateCost(match1);
        const cost2 = this.calculateCost(match2);
        return cost1 === cost2 ? 0 : cost1 < cost2 ? -1 : +1;
    }

    protected calculateCost(match: OverloadedMatch): number {
        return match.rule.assignabilitySuccess
            .flatMap(s => s?.path ?? []) // collect all conversion/sub-type edges which are required to map actual types to the expected types of the parameters
            // equal types (i.e. an empty path) are better than sub-types, sub-types are better than conversions
            .map(edge => (isSubTypeEdge(edge) ? 1 : isConversionEdge(edge) ? 2 : assertUnreachable(edge)) as number)
            .reduce((l, r) => l + r, 0);
    }
}

interface OverloadedMatch {
    result: Type;
    rule: FunctionCallInferenceRule<never>;
}
