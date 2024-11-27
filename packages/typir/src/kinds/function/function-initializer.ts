/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { CompositeTypeInferenceRule, InferenceProblem, InferenceRuleNotApplicable, TypeInferenceRule } from '../../features/inference.js';
import { Type, TypeStateListener } from '../../graph/type-node.js';
import { TypeInitializer } from '../../initialization/type-initializer.js';
import { resolveTypeSelector } from '../../initialization/type-reference.js';
import { TypirServices } from '../../typir.js';
import { checkTypeArrays } from '../../utils/utils-type-comparison.js';
import { assertType } from '../../utils/utils.js';
import { CreateFunctionTypeDetails, FunctionKind } from './function-kind.js';
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

        // prepare the overloads
        let overloaded = this.kind.mapNameTypes.get(functionName);
        if (overloaded) {
            // do nothing
        } else {
            overloaded = {
                overloadedFunctions: [],
                inference: new CompositeTypeInferenceRule(this.services),
                sameOutputType: undefined,
            };
            this.kind.mapNameTypes.set(functionName, overloaded);
            this.services.inference.addInferenceRule(overloaded.inference);
        }

        // create the new Function type
        this.initialFunctionType = new FunctionType(kind, typeDetails);

        this.inferenceRules = createInferenceRules(typeDetails, kind, this.initialFunctionType);
        registerInferenceRules(this.inferenceRules, kind, functionName, undefined);

        this.initialFunctionType.addListener(this, true);
    }

    override getTypeInitial(): FunctionType {
        return this.initialFunctionType;
    }

    switchedToIdentifiable(functionType: Type): void {
        const functionName = this.typeDetails.functionName;
        assertType(functionType, isFunctionType);
        const readyFunctionType = this.producedType(functionType);
        if (readyFunctionType !== functionType) {
            functionType.removeListener(this);
            deregisterInferenceRules(this.inferenceRules, this.kind, functionName, undefined);
            this.inferenceRules = createInferenceRules(this.typeDetails, this.kind, readyFunctionType);
            registerInferenceRules(this.inferenceRules, this.kind, functionName, readyFunctionType);
        } else {
            deregisterInferenceRules(this.inferenceRules, this.kind, functionName, undefined);
            registerInferenceRules(this.inferenceRules, this.kind, functionName, readyFunctionType);
        }

        // remember the new function for later in order to enable overloaded functions!
        // const functionName = typeDetails.functionName;
        const outputTypeForFunctionCalls = this.kind.getOutputTypeForFunctionCalls(readyFunctionType); // output parameter for function calls
        const overloaded = this.kind.mapNameTypes.get(functionName)!;
        if (overloaded.overloadedFunctions.length <= 0) {
            // remember the output type of the first function
            overloaded.sameOutputType = outputTypeForFunctionCalls;
        } else {
            if (overloaded.sameOutputType && outputTypeForFunctionCalls && this.services.equality.areTypesEqual(overloaded.sameOutputType, outputTypeForFunctionCalls) === true) {
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

    switchedToCompleted(functionType: Type): void {
        functionType.removeListener(this);
    }

    switchedToInvalid(_functionType: Type): void {
        // nothing specific needs to be done for Functions here, since the base implementation takes already care about all relevant stuff
    }
}

interface FunctionInferenceRules {
    forCall?: TypeInferenceRule;
    forDeclaration?: TypeInferenceRule;
}

function registerInferenceRules(rules: FunctionInferenceRules, functionKind: FunctionKind, functionName: string, functionType: FunctionType | undefined): void {
    if (rules.forCall) {
        const overloaded = functionKind.mapNameTypes.get(functionName)!;
        overloaded.inference.addInferenceRule(rules.forCall, functionType);
    }

    if (rules.forDeclaration) {
        functionKind.services.inference.addInferenceRule(rules.forDeclaration, functionType);
    }
}

function deregisterInferenceRules(rules: FunctionInferenceRules, functionKind: FunctionKind, functionName: string, functionType: FunctionType | undefined): void {
    if (rules.forCall) {
        const overloaded = functionKind.mapNameTypes.get(functionName);
        overloaded?.inference.removeInferenceRule(rules.forCall, functionType);
    }

    if (rules.forDeclaration) {
        functionKind.services.inference.removeInferenceRule(rules.forDeclaration, functionType);
    }
}

function createInferenceRules<T>(typeDetails: CreateFunctionTypeDetails<T>, functionKind: FunctionKind, functionType: FunctionType): FunctionInferenceRules {
    const result: FunctionInferenceRules = {};
    const functionName = typeDetails.functionName;
    const mapNameTypes = functionKind.mapNameTypes;
    const outputTypeForFunctionCalls = functionKind.getOutputTypeForFunctionCalls(functionType);
    if (typeDetails.inferenceRuleForCalls) { // TODO warum wird hier nicht einfach "outputTypeForFunctionCalls !== undefined" überprüft??
        /** Preconditions:
         * - there is a rule which specifies how to infer the current function type
         * - the current function has an output type/parameter, otherwise, this function could not provide any type (and throws an error), when it is called!
         *   (exception: the options contain a type to return in this special case)
         */
        function check(returnType: Type | undefined): Type {
            if (returnType) {
                return returnType;
            } else {
                throw new Error(`The function ${functionName} is called, but has no output type to infer.`);
            }
        }

        // register inference rule for calls of the new function
        // TODO what about the case, that multiple variants match?? after implicit conversion for example?! => overload with the lowest number of conversions wins!
        result.forCall = {
            inferTypeWithoutChildren(domainElement, _typir) {
                const result = typeDetails.inferenceRuleForCalls!.filter(domainElement);
                if (result) {
                    const matching = typeDetails.inferenceRuleForCalls!.matching(domainElement);
                    if (matching) {
                        const inputArguments = typeDetails.inferenceRuleForCalls!.inputArguments(domainElement);
                        if (inputArguments && inputArguments.length >= 1) {
                            // this function type might match, to be sure, resolve the types of the values for the parameters and continue to step 2
                            const overloadInfos = mapNameTypes.get(functionName);
                            if (overloadInfos && overloadInfos.overloadedFunctions.length >= 2) {
                                // (only) for overloaded functions:
                                if (overloadInfos.sameOutputType) {
                                    // exception: all(!) overloaded functions have the same(!) output type, save performance and return this type!
                                    return overloadInfos.sameOutputType;
                                } else {
                                    // otherwise: the types of the parameters need to be inferred in order to determine an exact match
                                    return inputArguments;
                                }
                            } else {
                                // the current function is not overloaded, therefore, the types of their parameters are not required => save time, ignore inference errors
                                return check(outputTypeForFunctionCalls);
                            }
                        } else {
                            // there are no operands to check
                            return check(outputTypeForFunctionCalls);
                        }
                    } else {
                        // the domain element is slightly different
                    }
                } else {
                    // the domain element has a completely different purpose
                }
                // does not match at all
                return InferenceRuleNotApplicable;
            },
            inferTypeWithChildrensTypes(domainElement, childrenTypes, typir) {
                const inputTypes = typeDetails.inputParameters.map(p => resolveTypeSelector(typir, p.type));
                // all operands need to be assignable(! not equal) to the required types
                const comparisonConflicts = checkTypeArrays(childrenTypes, inputTypes,
                    (t1, t2) => typir.assignability.getAssignabilityProblem(t1, t2), true);
                if (comparisonConflicts.length >= 1) {
                    // this function type does not match, due to assignability conflicts => return them as errors
                    return {
                        $problem: InferenceProblem,
                        domainElement,
                        inferenceCandidate: functionType,
                        location: 'input parameters',
                        rule: this,
                        subProblems: comparisonConflicts,
                    };
                    // We have a dedicated validation for this case (see below), but a resulting error might be ignored by the user => return the problem during type-inference again
                } else {
                    // matching => return the return type of the function for the case of a function call!
                    return check(outputTypeForFunctionCalls);
                }
            },
        };
    }

    // register inference rule for the declaration of the new function
    // (regarding overloaded function, for now, it is assumed, that the given inference rule itself is concrete enough to handle overloaded functions itself!)
    if (typeDetails.inferenceRuleForDeclaration) {
        result.forDeclaration = (domainElement, _typir) => {
            if (typeDetails.inferenceRuleForDeclaration!(domainElement)) {
                return functionType;
            } else {
                return InferenceRuleNotApplicable;
            }
        };
    }

    return result;
}
