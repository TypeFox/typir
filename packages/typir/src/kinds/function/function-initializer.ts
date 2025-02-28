/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { isType, Type, TypeStateListener } from '../../graph/type-node.js';
import { TypeInitializer } from '../../initialization/type-initializer.js';
import { CompositeTypeInferenceRule, InferenceProblem } from '../../services/inference.js';
import { ValidationRuleStateless } from '../../services/validation.js';
import { TypirServices } from '../../typir.js';
import { InferenceRuleWithOptions, optionsBoundToType, bindInferCurrentTypeRule } from '../../utils/utils-definitions.js';
import { checkTypeArrays } from '../../utils/utils-type-comparison.js';
import { assertType, toArray } from '../../utils/utils.js';
import { FunctionCallInferenceRule } from './function-inference-call.js';
import { CreateFunctionTypeDetails, FunctionKind, OverloadedFunctionDetails } from './function-kind.js';
import { OverloadedFunctionsTypeInferenceRule } from './function-inference-overloaded.js';
import { FunctionType, isFunctionType } from './function-type.js';

/**
 * For each call of FunctionKind.create()...finish(), one instance of this class will be created,
 * which at some point in time returns a new or an existing FunctionType.
 *
 * If the function type to create already exists, the given inference rules (and its validation rules) will be registered for the existing function type.
 */
export class FunctionTypeInitializer extends TypeInitializer<FunctionType> implements TypeStateListener {
    protected readonly typeDetails: CreateFunctionTypeDetails;
    protected readonly kind: FunctionKind;
    protected inferenceRules: FunctionInferenceRules;
    protected initialFunctionType: FunctionType;

    constructor(services: TypirServices, kind: FunctionKind, typeDetails: CreateFunctionTypeDetails) {
        super(services);
        this.typeDetails = typeDetails;
        this.kind = kind;

        const functionName = typeDetails.functionName;

        // check the input
        if (typeDetails.outputParameter === undefined && typeDetails.inferenceRulesForCalls.length >= 1) {
            // no output parameter => no inference rule for calling this function
            throw new Error(`A function '${functionName}' without output parameter cannot have an inferred type, when this function is called!`);
        }
        kind.enforceFunctionName(functionName, kind.options.enforceFunctionName);

        // prepare the overloads
        if (this.kind.mapNameTypes.has(functionName)) {
            // do nothing
        } else {
            const overloaded: OverloadedFunctionDetails = {
                overloadedFunctions: [],
                inference: this.createInferenceRuleForOverloads(),
                sameOutputType: undefined,
            };
            this.kind.mapNameTypes.set(functionName, overloaded);
        }

        // create the new Function type
        this.initialFunctionType = new FunctionType(kind, typeDetails);

        this.inferenceRules = this.createInferenceRules(typeDetails, this.initialFunctionType);
        this.registerInferenceRules(functionName, undefined);

        this.initialFunctionType.addListener(this, true);
    }

    protected createInferenceRuleForOverloads(): CompositeTypeInferenceRule {
        // This inference rule don't need to be registered at the Inference service, since it manages the (de)registrations itself!
        return new OverloadedFunctionsTypeInferenceRule(this.services, this.services.Inference);
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
        // register each inference rule for calls of the function
        this.typeDetails.inferenceRulesForCalls.forEach(rule => overloaded.overloadedFunctions.push({
            functionType: readyFunctionType,
            inferenceRuleForCalls: rule,
        }));
    }

    onSwitchedToCompleted(functionType: Type): void {
        functionType.removeListener(this);
    }

    onSwitchedToInvalid(_functionType: Type): void {
        // nothing specific needs to be done for Functions here, since the base implementation takes already care about all relevant stuff
    }

    protected registerInferenceRules(functionName: string, functionType: FunctionType | undefined): void {
        for (const rule of this.inferenceRules.inferenceForCall) {
            const overloaded = this.kind.mapNameTypes.get(functionName)!;
            overloaded.inference.addInferenceRule(rule.rule, optionsBoundToType(rule.options, functionType));
        }
        for (const check of this.inferenceRules.validationForCall) {
            this.kind.services.validation.Collector.addValidationRule(check, { boundToType: functionType });
        }
        for (const rule of this.inferenceRules.inferenceForDeclaration) {
            this.kind.services.Inference.addInferenceRule(rule.rule, optionsBoundToType(rule.options, functionType));
        }
    }

    protected deregisterInferenceRules(functionName: string, functionType: FunctionType | undefined): void {
        for (const rule of this.inferenceRules.inferenceForCall) {
            const overloaded = this.kind.mapNameTypes.get(functionName);
            overloaded?.inference.removeInferenceRule(rule.rule, optionsBoundToType(rule.options, functionType));
        }
        for (const check of this.inferenceRules.validationForCall) {
            this.kind.services.validation.Collector.removeValidationRule(check, { boundToType: functionType });
        }
        for (const rule of this.inferenceRules.inferenceForDeclaration) {
            this.kind.services.Inference.removeInferenceRule(rule.rule, optionsBoundToType(rule.options, functionType));
        }
    }

    protected createInferenceRules<T>(typeDetails: CreateFunctionTypeDetails, functionType: FunctionType): FunctionInferenceRules {
        const result: FunctionInferenceRules = {
            inferenceForCall: [],
            validationForCall: [],
            inferenceForDeclaration: [],
        };
        const mapNameTypes = this.kind.mapNameTypes;

        for (const rule of typeDetails.inferenceRulesForCalls) {
            // create inference rule for calls of the new function
            result.inferenceForCall.push({
                rule: new FunctionCallInferenceRule(typeDetails, rule, functionType, mapNameTypes),
                options: {
                    languageKey: rule.languageKey,
                    // boundToType: ... this property will be specified outside of this method, when this rule is registered
                },
            });

            // create validation rule which will be applied when this function is called according to the current inference rule for function calls (this includes the assignability of arguments to input parameters)
            for (const check of toArray(rule.validation)) {
                // TODO languageKey ??
                result.validationForCall.push((languageNode, typir) => {
                    if ((rule.filter === undefined || rule.filter(languageNode)) && (rule.matching === undefined || rule.matching(languageNode as T))) {
                        // check the input arguments, required for overloaded functions
                        const inputArguments = rule.inputArguments(languageNode as T);
                        if (inputArguments && inputArguments.length >= 1) {
                            // this function type might match, to be sure, resolve the types of the values for the parameters and continue to step 2
                            const overloadInfos = mapNameTypes.get(typeDetails.functionName);
                            if (overloadInfos && overloadInfos.overloadedFunctions.length >= 2) {
                                // for overloaded functions: the types of the parameters need to be inferred in order to determine an exact match
                                // (Note that the short-cut for type inference for function calls, when all overloads return the same output type, does not work here, since the validation here is specific for this single variant!)
                                // This is also the reason, why the inference rule for calls is not reused here.)
                                const childTypes: Array<Type | InferenceProblem[]> = inputArguments.map(child => typir.Inference.inferType(child));
                                const actualInputTypes = childTypes.filter(t => isType(t));
                                if (childTypes.length === actualInputTypes.length) {
                                    const expectedInputTypes = typeDetails.inputParameters.map(p => typir.infrastructure.TypeResolver.resolve(p.type));
                                    // all operands need to be assignable(! not equal) to the required types
                                    const comparisonConflicts = checkTypeArrays(actualInputTypes, expectedInputTypes,
                                        (t1, t2) => typir.Assignability.getAssignabilityProblem(t1, t2), true);
                                    if (comparisonConflicts.length <= 0) {
                                        // all arguments are assignable to the expected types of the parameters => this function is really called here => validate this call now
                                        return check(languageNode as T, functionType, typir);
                                    }
                                } else {
                                    // at least one argument could not be inferred
                                }
                            } else {
                                // the current function is not overloaded, therefore, the types of their parameters are not required => save time
                                return check(languageNode as T, functionType, typir);
                            }
                        } else {
                            // there are no operands to check
                            return check(languageNode as T, functionType, typir);
                        }
                    }
                    return [];
                });
            }
        }

        // create inference rule for the declaration of the new function
        // (regarding overloaded function, for now, it is assumed, that the given inference rule itself is concrete enough to handle overloaded functions itself!)
        for (const rule of typeDetails.inferenceRulesForDeclaration) {
            result.inferenceForDeclaration.push(bindInferCurrentTypeRule(rule, functionType));
        }

        return result;
    }

}

interface FunctionInferenceRules {
    inferenceForCall: Array<InferenceRuleWithOptions<FunctionCallInferenceRule<unknown>>>;
    validationForCall: ValidationRuleStateless[];
    inferenceForDeclaration: InferenceRuleWithOptions[];
}
