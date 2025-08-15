/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type, TypeDetails } from '../../graph/type-node.js';
import { TypeInitializer } from '../../initialization/type-initializer.js';
import { TypeReference } from '../../initialization/type-reference.js';
import { TypeDescriptor } from '../../initialization/type-descriptor.js';
import { ValidationRule } from '../../services/validation.js';
import { TypirSpecifics, TypirServices } from '../../typir.js';
import { InferCurrentTypeRule, NameTypePair, RegistrationOptions } from '../../utils/utils-definitions.js';
import { TypeCheckStrategy } from '../../utils/utils-type-comparison.js';
import { Kind, KindOptions } from '../kind.js';
import { FunctionTypeInitializer } from './function-initializer.js';
import { AvailableFunctionsManager } from './function-overloading.js';
import { FunctionType } from './function-type.js';
import { UniqueFunctionValidation } from './function-validation-unique.js';


export interface FunctionKindOptions<Specifics extends TypirSpecifics> extends KindOptions {
    // these three options controls structural vs nominal typing somehow ...
    enforceFunctionName: boolean,
    enforceInputParameterNames: boolean,
    enforceOutputParameterName: boolean,
    /** Will be used only internally as prefix for the unique identifiers for function type names. */
    identifierPrefix: string,
    /** If a function has no output type (e.g. "void" functions), this type is returned during the type inference of calls to these functions.
     * The default value "THROW_ERROR" indicates to throw an error, i.e. type inference for calls of such functions are not allowed. */
    typeToInferForCallsOfFunctionsWithoutOutput: 'THROW_ERROR' | TypeDescriptor<Type, Specifics>;
    subtypeParameterChecking: TypeCheckStrategy;
}

export const FunctionKindName = 'FunctionKind';


export interface CreateParameterDetails<Specifics extends TypirSpecifics> {
    name: string;
    type: TypeDescriptor<Type, Specifics>;
}

export interface FunctionTypeDetails<Specifics extends TypirSpecifics> extends TypeDetails<Specifics> {
    functionName: string,
    /** The order of parameters is important! */
    outputParameter: CreateParameterDetails<Specifics> | undefined,
    inputParameters: Array<CreateParameterDetails<Specifics>>,
}

export interface CreateFunctionTypeDetails<Specifics extends TypirSpecifics> extends FunctionTypeDetails<Specifics> {
    inferenceRulesForDeclaration: Array<InferCurrentTypeRule<FunctionType, Specifics>>,
    inferenceRulesForCalls: Array<InferFunctionCall<Specifics, Specifics['LanguageType']>>,
}

export interface InferFunctionCall<
    Specifics extends TypirSpecifics, T extends Specifics['LanguageType'] = Specifics['LanguageType']
> extends InferCurrentTypeRule<FunctionType, Specifics, T> {
    /**
     * In case of overloaded functions, these input arguments are used to determine the actual function
     * by comparing the types of the given arguments with the expected types of the input parameters of the function.
     */
    inputArguments: (languageNode: T) => Array<Specifics['LanguageType']>;

    /**
     * This property controls the builtin validation which checks, whether the types of the given arguments of the function call
     * fit to the expected types of the parameters of the function.
     * The function calls to validate are represented by this inference rule,
     * i.e. function calls represented by other inference rules have their own property and are not influenced by the value of this inference rule.
     * By default, the property is switched off (e.g. `validateArgumentsOfFunctionCalls: false`),
     * but in most applications this validation is desired and should be switched on (e.g. with `validateArgumentsOfFunctionCalls: true`).
     * This property does _not_ influence the type inference,
     * this property determines only, whether this special validation is applied to the current function call.
     *
     * This property is specific for this function type.
     * If this function type is not overloaded, this property switches this validation off and on for the calls of this function,
     * i.e. creates validation issues for all calls with mismatching argument types.
     *
     * If this function type is overloaded, different values for this property for different overloaded functions might be specified:
     * If the property is switched off for all overloads, no validation issues will be created.
     * If the property is switched on for at least one overload, validation issues for will be shown for all calls (when none of the signatures match),
     * since it is unclear, which of the overloads is the desired one!
     * But the shown validation issue/message will not report about signatures for which this validation property is switched off.
     * While different values for this property for different overloads are possible in theory with the defined behaviour,
     * in practise this seems to be rarely useful.
     */
    validateArgumentsOfFunctionCalls?: boolean | ((languageNode: T) => boolean);
}

/**
 * Architecture of Inference rules:
 * - flag for overload / checking parameter types => no, that is bad usability, e.g. operators use already overloaded functions!
 * - overloaded functions are specific for the function kind => solve it inside the FunctionKind!
 *
 * How many inference rules?
 * - The inference rule for calls of each function type with the same name are grouped together in order to provide better error messages, if none of the variants match.
 * - Checking multiple functions within the same rule (e.g. only one inference rule for the function kind or one inference rule for each function name) does not work,
 *   since multiple different sets of parameters must be returned for overloaded functions!
 * - multiple IR collectors: how to apply all the other rules?!
 *
 * How many validation rules?
 * - For validation, it is enough that at least one of the function variants match!
 * - But checking that is not possible with independent rules for each function variant.
 * - Therefore, it must be a single validation for each function name (with all type variants).
 * - In order to simplify (de)registering validation rules, only one validation rule for all functions is used here (with an internal loop over all function names).
 *
 * How to know the available (overloaded) functions?
 * - search in all Types VS remember them in a Map; add VS remove function type
 */


export interface FunctionFactoryService<Specifics extends TypirSpecifics> {
    create(typeDetails: FunctionTypeDetails<Specifics>): FunctionConfigurationChain<Specifics>;
    get(typeDetails: FunctionTypeDetails<Specifics>): TypeReference<FunctionType, Specifics>;
    calculateIdentifier(typeDetails: FunctionTypeDetails<Specifics>): string;

    // some predefined valitions:

    /** Creates a validation rule which checks, that the function types are unique. */
    createUniqueFunctionValidation(options: RegistrationOptions): ValidationRule<Specifics>;

    // benefits of this design decision: the returned rule is easier to exchange, users can use the known factory API with auto-completion (no need to remember the names of the validations)
}

export interface FunctionConfigurationChain<Specifics extends TypirSpecifics> {
    /** for function declarations => returns the funtion type (the whole signature including all names) */
    inferenceRuleForDeclaration<T extends Specifics['LanguageType']>(rule: InferCurrentTypeRule<FunctionType, Specifics, T>): FunctionConfigurationChain<Specifics>;
    /** for function calls => returns the return type of the function */
    inferenceRuleForCalls<T extends Specifics['LanguageType']>(rule: InferFunctionCall<Specifics, T>): FunctionConfigurationChain<Specifics>,

    // TODO for function references (like the declaration, but without any names!) => returns signature (without any names)

    finish(): TypeInitializer<FunctionType, Specifics>;
}

/**
 * Represents signatures of executable code.
 *
 * Constraints of overloaded functions:
 * - no duplicated variants!
 * - The names of all paramaters don't matter for functions to be unique.
 * - a variant is uniquely identified by: function name (if available), types of input parameters; options.identifierPrefix
 * - For overloaded functions, it is not enough to have different output types or different parameter names!
 *
 * TODO possible Extensions:
 * - multiple output parameters
 * - create variants of this, e.g. functions, procedures, lambdas
 * - (structural vs nominal typing? somehow realized by the three options above ...)
 * - optional parameters
 * - parameters which are used for output AND input
 */
export class FunctionKind<Specifics extends TypirSpecifics> implements Kind, FunctionFactoryService<Specifics> {
    readonly $name: string;
    readonly services: TypirServices<Specifics>;
    readonly options: Readonly<FunctionKindOptions<Specifics>>;
    readonly functions: AvailableFunctionsManager<Specifics>;

    constructor(services: TypirServices<Specifics>, options?: Partial<FunctionKindOptions<Specifics>>) {
        this.options = this.collectOptions(options);
        this.$name = this.options.$name;
        this.services = services;
        this.services.infrastructure.Kinds.register(this);
        this.functions = this.createFunctionManager();
    }

    protected collectOptions(options?: Partial<FunctionKindOptions<Specifics>>): FunctionKindOptions<Specifics> {
        return {
            // the default values:
            $name: FunctionKindName,
            enforceFunctionName: false,
            enforceInputParameterNames: false,
            enforceOutputParameterName: false,
            identifierPrefix: 'function',
            typeToInferForCallsOfFunctionsWithoutOutput: 'THROW_ERROR',
            subtypeParameterChecking: 'SUB_TYPE',
            // the actually overriden values:
            ...options
        };
    }

    protected createFunctionManager(): AvailableFunctionsManager<Specifics> {
        return new AvailableFunctionsManager(this.services, this);
    }

    get(typeDetails: FunctionTypeDetails<Specifics>): TypeReference<FunctionType, Specifics> {
        return new TypeReference<FunctionType, Specifics>(() => this.calculateIdentifier(typeDetails), this.services);
    }

    create(typeDetails: FunctionTypeDetails<Specifics>): FunctionConfigurationChain<Specifics> {
        return new FunctionConfigurationChainImpl(this.services, this, typeDetails);
    }

    getOutputTypeForFunctionCalls(functionType: FunctionType): Type | undefined {
        return functionType.getOutput('RETURN_UNDEFINED')?.type ?? // by default, use the return type of the function ...
            // ... if this type is missing, use the specified type for this case in the options:
            // 'THROW_ERROR': an error will be thrown later, when this case actually occurs!
            (this.options.typeToInferForCallsOfFunctionsWithoutOutput === 'THROW_ERROR'
                ? undefined
                : this.services.infrastructure.TypeResolver.resolve(this.options.typeToInferForCallsOfFunctionsWithoutOutput));
    }

    calculateIdentifier(typeDetails: FunctionTypeDetails<Specifics>): string {
        const prefix = this.options.identifierPrefix ? this.options.identifierPrefix + '-' : '';
        // function name, if wanted
        const functionName = this.hasFunctionName(typeDetails.functionName) ? typeDetails.functionName : '';
        // inputs: type identifiers in defined order
        const inputsString = typeDetails.inputParameters.map(input => this.services.infrastructure.TypeResolver.resolve(input.type).getIdentifier()).join(',');
        // output: type identifier
        const outputString = typeDetails.outputParameter ? this.services.infrastructure.TypeResolver.resolve(typeDetails.outputParameter.type).getIdentifier() : '';
        // complete signature
        return `${prefix}${functionName}(${inputsString}):${outputString}`;
    }

    getParameterRepresentation(parameter: NameTypePair): string {
        const typeName = parameter.type.getName();
        if (this.hasParameterName(parameter.name)) {
            return `${parameter.name}: ${typeName}`;
        } else {
            return typeName;
        }
    }

    enforceFunctionName(name: string | undefined, enforce: boolean): void {
        if (enforce && this.hasFunctionName(name) === false) {
            throw new Error('A name for the function is required.');
        }
    }
    hasFunctionName(name: string | undefined): name is string {
        return name !== undefined && name !== NO_FUNCTION_NAME;
    }

    enforceParameterName(name: string | undefined, enforce: boolean): void {
        if (enforce && this.hasParameterName(name) === false) {
            throw new Error('A name for the parameter is required.');
        }
    }
    hasParameterName(name: string | undefined): name is string {
        return name !== undefined && name !== NO_PARAMETER_NAME;
    }

    createUniqueFunctionValidation(options: RegistrationOptions): ValidationRule<Specifics> {
        const rule = new UniqueFunctionValidation(this.services);
        if (options.registration === 'MYSELF') {
            // do nothing, the user is responsible to register the rule
        } else {
            this.services.validation.Collector.addValidationRule(rule, options.registration);
        }
        return rule;
    }
}

export function isFunctionKind<Specifics extends TypirSpecifics>(kind: unknown): kind is FunctionKind<Specifics> {
    return kind instanceof FunctionKind;
}


class FunctionConfigurationChainImpl<Specifics extends TypirSpecifics> implements FunctionConfigurationChain<Specifics> {
    protected readonly services: TypirServices<Specifics>;
    protected readonly kind: FunctionKind<Specifics>;
    protected readonly currentFunctionDetails: CreateFunctionTypeDetails<Specifics>;

    constructor(services: TypirServices<Specifics>, kind: FunctionKind<Specifics>, typeDetails: FunctionTypeDetails<Specifics>) {
        this.services = services;
        this.kind = kind;
        this.currentFunctionDetails = {
            ...typeDetails,
            inferenceRulesForDeclaration: [],
            inferenceRulesForCalls: [],
        };
    }

    inferenceRuleForDeclaration<T extends Specifics['LanguageType']>(rule: InferCurrentTypeRule<FunctionType, Specifics, T>): FunctionConfigurationChain<Specifics> {
        this.currentFunctionDetails.inferenceRulesForDeclaration.push(rule as unknown as InferCurrentTypeRule<FunctionType, Specifics>);
        return this;
    }

    inferenceRuleForCalls<T extends Specifics['LanguageType']>(rule: InferFunctionCall<Specifics, T>): FunctionConfigurationChain<Specifics> {
        this.currentFunctionDetails.inferenceRulesForCalls.push(rule as unknown as InferFunctionCall<Specifics>);
        return this;
    }

    finish(): TypeInitializer<FunctionType, Specifics> {
        return new FunctionTypeInitializer<Specifics>(this.services, this.kind, this.currentFunctionDetails);
    }
}

// when the name is missing (e.g. for functions or their input/output parameters), use these values instead
export const NO_FUNCTION_NAME = '';
export const NO_PARAMETER_NAME = '';
