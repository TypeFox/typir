/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type, TypeStateListener } from '../../graph/type-node.js';
import { TypeInitializer } from '../../initialization/type-initializer.js';
import { CompositeTypeInferenceRule } from '../../services/inference.js';
import { TypirServices } from '../../typir.js';
import { RuleRegistry } from '../../utils/rule-registration.js';
import { bindInferCurrentTypeRule, InferenceRuleWithOptions, optionsBoundToType } from '../../utils/utils-definitions.js';
import { assertType } from '../../utils/utils.js';
import { FunctionCallInferenceRule } from './function-inference-call.js';
import { OverloadedFunctionsTypeInferenceRule } from './function-inference-overloaded.js';
import { CreateFunctionTypeDetails, FunctionKind, OverloadedFunctionDetails } from './function-kind.js';
import { FunctionType, isFunctionType } from './function-type.js';

/**
 * For each call of FunctionKind.create()...finish(), one instance of this class will be created,
 * which at some point in time returns a new or an existing FunctionType.
 *
 * If the function type to create already exists, the given inference rules (and its validation rules) will be registered for the existing function type.
 */
export class FunctionTypeInitializer<LanguageType = unknown> extends TypeInitializer<FunctionType, LanguageType> implements TypeStateListener {
    protected readonly typeDetails: CreateFunctionTypeDetails<LanguageType>;
    protected readonly kind: FunctionKind<LanguageType>;
    protected inferenceRules: FunctionInferenceRules<LanguageType>;
    protected initialFunctionType: FunctionType;

    constructor(services: TypirServices<LanguageType>, kind: FunctionKind<LanguageType>, typeDetails: CreateFunctionTypeDetails<LanguageType>) {
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
            const overloaded: OverloadedFunctionDetails<LanguageType> = {
                overloadedFunctions: [],
                details: new RuleRegistry(services),
                inferenceRule: this.createInferenceRuleForOverloads(),
                sameOutputType: undefined,
            };
            this.kind.mapNameTypes.set(functionName, overloaded);
            // the "global" validation for function calls needs to update its registration according to added/removed inference rules for calls of added/removed functions
            overloaded.details.addListener(kind.validatorArgumentsCalls);
        }

        // create the new Function type
        this.initialFunctionType = new FunctionType(kind as FunctionKind, typeDetails);

        this.inferenceRules = this.createInferenceRules(typeDetails, this.initialFunctionType);
        this.registerRules(functionName, undefined);

        this.initialFunctionType.addListener(this, true);
    }

    protected createInferenceRuleForOverloads(): CompositeTypeInferenceRule<LanguageType> {
        // This inference rule don't need to be registered at the Inference service, since it manages the (de)registrations itself!
        return new OverloadedFunctionsTypeInferenceRule<LanguageType>(this.services, this.services.Inference);
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
            this.inferenceRules = this.createInferenceRules(this.typeDetails, readyFunctionType);
            this.registerRules(functionName, readyFunctionType);
        } else {
            this.deregisterRules(functionName, undefined);
            this.registerRules(functionName, readyFunctionType);
        }

        // remember the new function for later in order to enable overloaded functions!
        const overloaded = this.kind.mapNameTypes.get(functionName)!;
        // Have all overloaded functions the same output type?
        const outputTypeForFunctionCalls = this.kind.getOutputTypeForFunctionCalls(readyFunctionType); // output parameter for function calls
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
        // remember the function type itself
        overloaded.overloadedFunctions.push(readyFunctionType);
        // register each inference rule for calls of the function
        this.typeDetails.inferenceRulesForCalls.forEach(rule => overloaded.details.addRule({
            functionType: readyFunctionType,
            inferenceRuleForCalls: rule,
        }, {
            languageKey: rule.languageKey, // the language keys are directly encoded inside these special inference rules for function calls
            boundToType: readyFunctionType, // these rules are specific for current function type/signature
        }));
    }

    onSwitchedToCompleted(functionType: Type): void {
        functionType.removeListener(this);
    }

    onSwitchedToInvalid(_functionType: Type): void {
        // nothing specific needs to be done for Functions here, since the base implementation takes already care about all relevant stuff
    }

    protected registerRules(functionName: string, functionType: FunctionType | undefined): void {
        for (const rule of this.inferenceRules.inferenceForCall) {
            const overloaded = this.kind.mapNameTypes.get(functionName)!;
            overloaded.inferenceRule.addInferenceRule(rule.rule, optionsBoundToType(rule.options, functionType));
        }
        for (const rule of this.inferenceRules.inferenceForDeclaration) {
            this.kind.services.Inference.addInferenceRule(rule.rule, optionsBoundToType(rule.options, functionType));
        }
    }

    protected deregisterRules(functionName: string, functionType: FunctionType | undefined): void {
        for (const rule of this.inferenceRules.inferenceForCall) {
            const overloaded = this.kind.mapNameTypes.get(functionName);
            overloaded?.inferenceRule.removeInferenceRule(rule.rule, optionsBoundToType(rule.options, functionType));
        }
        for (const rule of this.inferenceRules.inferenceForDeclaration) {
            this.kind.services.Inference.removeInferenceRule(rule.rule, optionsBoundToType(rule.options, functionType));
        }
    }

    protected createInferenceRules(typeDetails: CreateFunctionTypeDetails<LanguageType>, functionType: FunctionType): FunctionInferenceRules<LanguageType> {
        const result: FunctionInferenceRules<LanguageType> = {
            inferenceForCall: [],
            inferenceForDeclaration: [],
        };

        for (const rule of typeDetails.inferenceRulesForCalls) {
            // create inference rule for calls of the new function
            result.inferenceForCall.push({
                rule: new FunctionCallInferenceRule<LanguageType>(typeDetails, rule, functionType, this.kind.mapNameTypes),
                options: {
                    languageKey: rule.languageKey,
                    // boundToType: ... this property will be specified outside of this method, when this rule is registered
                },
            });
        }

        // create inference rule for the declaration of the new function
        // (regarding overloaded function, for now, it is assumed, that the given inference rule itself is concrete enough to handle overloaded functions itself!)
        for (const rule of typeDetails.inferenceRulesForDeclaration) {
            result.inferenceForDeclaration.push(bindInferCurrentTypeRule(rule, functionType));
        }

        return result;
    }

}

interface FunctionInferenceRules<LanguageType = unknown> {
    inferenceForCall: Array<InferenceRuleWithOptions<LanguageType>>;
    inferenceForDeclaration: Array<InferenceRuleWithOptions<LanguageType>>;
}
