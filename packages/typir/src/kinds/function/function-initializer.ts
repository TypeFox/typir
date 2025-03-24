/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type, TypeStateListener } from '../../graph/type-node.js';
import { TypeInitializer } from '../../initialization/type-initializer.js';
import { TypeInferenceRule } from '../../services/inference.js';
import { TypirServices } from '../../typir.js';
import { bindInferCurrentTypeRule, InferenceRuleWithOptions, optionsBoundToType } from '../../utils/utils-definitions.js';
import { assertType } from '../../utils/utils.js';
import { FunctionCallInferenceRule } from './function-inference-call.js';
import { CreateFunctionTypeDetails, FunctionKind, FunctionTypeDetails, InferFunctionCall } from './function-kind.js';
import { AvailableFunctionsManager } from './function-overloading.js';
import { FunctionType, isFunctionType } from './function-type.js';

/**
 * For each call of FunctionKind.create()...finish(), one instance of this class will be created,
 * which at some point in time returns a new or an existing FunctionType.
 *
 * If the function type to create already exists, the given inference rules (and its validation rules) will be registered for the existing function type.
 */
export class FunctionTypeInitializer<LanguageType = unknown> extends TypeInitializer<FunctionType, LanguageType> implements TypeStateListener {
    protected readonly typeDetails: CreateFunctionTypeDetails<LanguageType>;
    protected readonly functions: AvailableFunctionsManager<LanguageType>;
    protected inferenceRules: FunctionInferenceRules<LanguageType>;
    protected initialFunctionType: FunctionType;

    constructor(services: TypirServices<LanguageType>, kind: FunctionKind<LanguageType>, typeDetails: CreateFunctionTypeDetails<LanguageType>) {
        super(services);
        this.typeDetails = typeDetails;
        this.functions = kind.functions;

        const functionName = typeDetails.functionName;

        // check the input
        if (typeDetails.outputParameter === undefined && typeDetails.inferenceRulesForCalls.length >= 1) {
            // no output parameter => no inference rule for calling this function
            throw new Error(`A function '${functionName}' without output parameter cannot have an inferred type, when this function is called!`);
        }
        kind.enforceFunctionName(functionName, kind.options.enforceFunctionName);

        // create the new Function type
        this.initialFunctionType = new FunctionType(kind as FunctionKind, typeDetails as FunctionTypeDetails);

        this.inferenceRules = this.createInferenceRules(this.initialFunctionType);
        this.registerRules(functionName, undefined);

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
            this.deregisterRules(functionName, undefined);
            this.inferenceRules = this.createInferenceRules(readyFunctionType);
            this.registerRules(functionName, readyFunctionType);
        } else {
            this.deregisterRules(functionName, undefined);
            this.registerRules(functionName, readyFunctionType);
        }

        // There is no need to remove the skipped type, since it is not yet added here, since the new types is skipped in favor of the already existing (and added) type!
        this.functions.addFunction(readyFunctionType, this.typeDetails.inferenceRulesForCalls);
    }

    onSwitchedToCompleted(functionType: Type): void {
        functionType.removeListener(this);
    }

    onSwitchedToInvalid(_functionType: Type): void {
        // nothing specific needs to be done for Functions here, since the base implementation takes already care about all relevant stuff
    }

    protected registerRules(functionName: string, functionType: FunctionType | undefined): void {
        for (const rule of this.inferenceRules.inferenceForCall) {
            const overloaded = this.functions.getOrCreateOverloads(functionName);
            overloaded.inferenceRule.addInferenceRule(rule.rule, optionsBoundToType(rule.options, functionType));
        }
        for (const rule of this.inferenceRules.inferenceForDeclaration) {
            this.services.Inference.addInferenceRule(rule.rule, optionsBoundToType(rule.options, functionType));
        }
    }

    protected deregisterRules(functionName: string, functionType: FunctionType | undefined): void {
        for (const rule of this.inferenceRules.inferenceForCall) {
            const overloaded = this.functions.getOverloads(functionName);
            overloaded?.inferenceRule.removeInferenceRule(rule.rule, optionsBoundToType(rule.options, functionType));
        }
        for (const rule of this.inferenceRules.inferenceForDeclaration) {
            this.services.Inference.removeInferenceRule(rule.rule, optionsBoundToType(rule.options, functionType));
        }
    }

    protected createInferenceRules(functionType: FunctionType): FunctionInferenceRules<LanguageType> {
        const result: FunctionInferenceRules<LanguageType> = {
            inferenceForCall: [],
            inferenceForDeclaration: [],
        };

        for (const rule of this.typeDetails.inferenceRulesForCalls) {
            // create inference rule for calls of the new function
            result.inferenceForCall.push({
                rule: this.createFunctionCallInferenceRule(rule, functionType),
                options: {
                    languageKey: rule.languageKey,
                    // boundToType: ... this property will be specified outside of this method, when this rule is registered
                },
            });
        }

        // create inference rule for the declaration of the new function
        // (regarding overloaded function, for now, it is assumed, that the given inference rule itself is concrete enough to handle overloaded functions itself!)
        for (const rule of this.typeDetails.inferenceRulesForDeclaration) {
            result.inferenceForDeclaration.push(bindInferCurrentTypeRule(rule, functionType));
        }

        return result;
    }

    protected createFunctionCallInferenceRule(rule: InferFunctionCall<LanguageType>, functionType: FunctionType): TypeInferenceRule<LanguageType> {
        return new FunctionCallInferenceRule<LanguageType>(this.typeDetails, rule, functionType, this.functions);
    }
}

interface FunctionInferenceRules<LanguageType = unknown> {
    inferenceForCall: Array<InferenceRuleWithOptions<LanguageType>>;
    inferenceForDeclaration: Array<InferenceRuleWithOptions<LanguageType>>;
}
