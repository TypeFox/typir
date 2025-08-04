/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeGraphListener } from '../../graph/type-graph.js';
import { Type } from '../../graph/type-node.js';
import { CompositeTypeInferenceRule } from '../../services/inference.js';
import { TypirServices, TypirSpecifics } from '../../typir.js';
import { RuleRegistry } from '../../utils/rule-registration.js';
import { removeFromArray } from '../../utils/utils.js';
import { OverloadedFunctionsTypeInferenceRule } from './function-inference-overloaded.js';
import { FunctionKind, InferFunctionCall } from './function-kind.js';
import { FunctionType, isFunctionType } from './function-type.js';
import { FunctionCallArgumentsValidation } from './function-validation-calls.js';

/**
 * Collects information about all functions with the same name.
 * This is required to handle overloaded functions.
 */
export interface OverloadedFunctionDetails<Specifics extends TypirSpecifics> {
    /** All function overloads/signatures with the same name. */
    overloadedFunctions: FunctionType[];
    /** Collects the details of all functions with the same name, grouped by language keys of their inference rules for function calls. */
    details: RuleRegistry<SingleFunctionDetails<Specifics>, Specifics>;
    /** Collects the inference rules for all functions with the same name */
    inferenceRule: CompositeTypeInferenceRule<Specifics>; // remark: language keys are internally used during the registration of rules and during the inference using these rules
    /** If all overloaded functions with the same name have the same output/return type, this type is remembered here (for a small performance optimization). */
    sameOutputType: Type | undefined;
}

export interface SingleFunctionDetails<Specifics extends TypirSpecifics, T extends Specifics['LanguageType'] = Specifics['LanguageType']> {
    functionType: FunctionType;
    inferenceRuleForCalls: InferFunctionCall<Specifics, T>;
}


/**
 * Contains all the logic to manage all available functions,
 * in particular, to support overloaded functions.
 * In each type system, exactly one instance of this class is stored by the FunctionKind.
 */
export class AvailableFunctionsManager<Specifics extends TypirSpecifics> implements TypeGraphListener {
    protected readonly services: TypirServices<Specifics>;
    protected readonly kind: FunctionKind<Specifics>;

    /**
     * function name => all overloaded functions (with additional information) with this name/key
     * - The types could be collected with the TypeGraphListener, but the additional information like inference rules are not available.
     *   Therefore this map needs to be maintained here.
     * - Main purpose is to support inference and validation for overloaded functions:
     *   Since overloaded functions are realized with one function type for each variant,
     *   the corresponding rules and logic need to involve multiple types,
     *   which makes it more complex and requires to manage them here and not in the single types.
     */
    protected readonly mapNameTypes: Map<string, OverloadedFunctionDetails<Specifics>> = new Map();

    protected readonly validatorArgumentsCalls: FunctionCallArgumentsValidation<Specifics>;

    constructor(services: TypirServices<Specifics>, kind: FunctionKind<Specifics>) {
        this.services = services;
        this.kind = kind;

        this.services.infrastructure.Graph.addListener(this);

        // this validation rule for checking arguments of function calls exists "for ever", since it validates all function types
        this.validatorArgumentsCalls = this.createFunctionCallArgumentsValidation();
    }

    protected createFunctionCallArgumentsValidation(): FunctionCallArgumentsValidation<Specifics> {
        // since kind/map is required for the validation (but not visible to the outside), it is created here by the factory
        return new FunctionCallArgumentsValidation(this.services, this);
    }

    protected createInferenceRuleForOverloads(): CompositeTypeInferenceRule<Specifics> {
        // This inference rule don't need to be registered at the Inference service, since it manages the (de)registrations itself!
        return new OverloadedFunctionsTypeInferenceRule<Specifics>(this.services, this.services.Inference);
    }


    getOverloads(functionName: string): OverloadedFunctionDetails<Specifics> | undefined {
        return this.mapNameTypes.get(functionName);
    }

    getOrCreateOverloads(functionName: string): OverloadedFunctionDetails<Specifics> {
        let result = this.mapNameTypes.get(functionName);
        if (result === undefined) {
            result = {
                overloadedFunctions: [],
                details: new RuleRegistry(this.services),
                inferenceRule: this.createInferenceRuleForOverloads(),
                sameOutputType: undefined,
            };
            this.mapNameTypes.set(functionName, result);
            // the "global" validation for function calls needs to update its registration according to added/removed inference rules for calls of added/removed functions
            result.details.addListener(this.validatorArgumentsCalls);
        }
        return result;
    }

    getAllOverloads(): MapIterator<[string, OverloadedFunctionDetails<Specifics>]> {
        return this.mapNameTypes.entries();
    }

    addFunction(readyFunctionType: FunctionType, inferenceRulesForCalls: Array<InferFunctionCall<Specifics, Specifics['LanguageType']>>): void {
        const overloaded = this.getOrCreateOverloads(readyFunctionType.functionName);

        // remember the function type itself
        overloaded.overloadedFunctions.push(readyFunctionType);

        this.calculateSameOutputType(overloaded);

        // register each inference rule for calls of the function
        inferenceRulesForCalls.forEach(rule => overloaded.details.addRule({
            functionType: readyFunctionType,
            inferenceRuleForCalls: rule,
        }, {
            languageKey: rule.languageKey, // the language keys are directly encoded inside these special inference rules for function calls
            boundToType: readyFunctionType, // these rules are specific for current function type/signature
        }));
    }

    /* Get informed about deleted types in order to remove inference rules which are bound to them. */
    onRemovedType(type: Type, _key: string): void {
        if (isFunctionType(type)) {
            const overloaded = this.getOverloads(type.functionName);
            if (overloaded) {
                // remove the current function
                const removed = removeFromArray(type, overloaded.overloadedFunctions);
                if (removed) {
                    this.calculateSameOutputType(overloaded);
                }
                // the rule registry removes this function type on its own => nothing to do here
                // its inference rule is removed by the CompositeTypeInferenceRule => nothing to do here
            }
        }
    }

    protected calculateSameOutputType(overloaded: OverloadedFunctionDetails<Specifics>): void {
        overloaded.sameOutputType = undefined;
        for (let index = 0; index < overloaded.overloadedFunctions.length; index++) {
            const current = overloaded.overloadedFunctions[index];
            const outputTypeForFunctionCalls = this.kind.getOutputTypeForFunctionCalls(current); // output parameter for function calls
            if (index === 0) {
                overloaded.sameOutputType = outputTypeForFunctionCalls;
            } else {
                if (overloaded.sameOutputType && outputTypeForFunctionCalls && this.services.Equality.areTypesEqual(overloaded.sameOutputType, outputTypeForFunctionCalls) === true) {
                    // the output types of all overloaded functions are the same for now
                } else {
                    // there is a difference
                    overloaded.sameOutputType = undefined;
                    break;
                }
            }
        }
    }

}
