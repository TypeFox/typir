/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type } from '../graph/type-node.js';
import { TypeInitializer } from '../initialization/type-initializer.js';
import { FunctionFactoryService, NO_PARAMETER_NAME } from '../kinds/function/function-kind.js';
import { FunctionType } from '../kinds/function/function-type.js';
import { TypirServices } from '../typir.js';
import { NameTypePair } from '../utils/utils-definitions.js';
import { toArray } from '../utils/utils.js';
import { ValidationProblemAcceptor } from './validation.js';

export interface InferOperatorWithSingleOperand<LanguageType, T extends LanguageType = LanguageType> {
    languageKey?: string | string[];
    filter?: (languageNode: LanguageType, operatorName: string) => languageNode is T;
    matching: (languageNode: T, operatorName: string) => boolean;
    operand: (languageNode: T, operatorName: string) => LanguageType;
    validation?: OperatorValidationRule<FunctionType, LanguageType, T> | Array<OperatorValidationRule<FunctionType, LanguageType, T>>;
    validateArgumentsOfCalls?: boolean | ((languageNode: T) => boolean);
}
export interface InferOperatorWithMultipleOperands<LanguageType, T extends LanguageType = LanguageType> {
    languageKey?: string | string[];
    filter?: (languageNode: LanguageType, operatorName: string) => languageNode is T;
    matching: (languageNode: T, operatorName: string) => boolean;
    operands: (languageNode: T, operatorName: string) => LanguageType[];
    validation?: OperatorValidationRule<FunctionType, LanguageType, T> | Array<OperatorValidationRule<FunctionType, LanguageType, T>>;
    validateArgumentsOfCalls?: boolean | ((languageNode: T) => boolean);
}

export type OperatorValidationRule<TypeType extends Type, LanguageType, T extends LanguageType = LanguageType> =
    (operatorCall: T, operatorName: string, operatorType: TypeType, accept: ValidationProblemAcceptor<LanguageType>, typir: TypirServices<LanguageType>) => void;

export interface AnyOperatorDetails {
    name: string;
}

export interface UnaryOperatorDetails extends AnyOperatorDetails {
    signature?: UnaryOperatorSignature;
    signatures?: UnaryOperatorSignature[];
}
export interface UnaryOperatorSignature {
    operand: Type;
    return: Type;
}
interface CreateUnaryOperatorDetails<LanguageType> extends UnaryOperatorDetails { // only internally used for collecting all information with the chaining API
    inferenceRules: Array<InferOperatorWithSingleOperand<LanguageType>>;
}

export interface BinaryOperatorDetails extends AnyOperatorDetails {
    signature?: BinaryOperatorSignature;
    signatures?: BinaryOperatorSignature[];
}
export interface BinaryOperatorSignature {
    left: Type;
    right: Type;
    return: Type;
}
interface CreateBinaryOperatorDetails<LanguageType> extends BinaryOperatorDetails { // only internally used for collecting all information with the chaining API
    inferenceRules: Array<InferOperatorWithMultipleOperands<LanguageType>>;
}

export interface TernaryOperatorDetails extends AnyOperatorDetails {
    signature?: TernaryOperatorSignature;
    signatures?: TernaryOperatorSignature[];
}
export interface TernaryOperatorSignature {
    first: Type;
    second: Type;
    third: Type;
    return: Type;
}
interface CreateTernaryOperatorDetails<LanguageType> extends TernaryOperatorDetails { // only internally used for collecting all information with the chaining API
    inferenceRules: Array<InferOperatorWithMultipleOperands<LanguageType>>;
}

export interface GenericOperatorDetails extends AnyOperatorDetails {
    outputType: Type;
    inputParameter: NameTypePair[];
}
interface CreateGenericOperatorDetails<LanguageType> extends GenericOperatorDetails { // only internally used for collecting all information with the chaining API
    inferenceRules: Array<InferOperatorWithSingleOperand<LanguageType> | InferOperatorWithMultipleOperands<LanguageType>>;
}

export interface OperatorFactoryService<LanguageType> {
    createUnary(typeDetails: UnaryOperatorDetails): OperatorConfigurationUnaryChain<LanguageType>;
    createBinary(typeDetails: BinaryOperatorDetails): OperatorConfigurationBinaryChain<LanguageType>;
    createTernary(typeDetails: TernaryOperatorDetails): OperatorConfigurationTernaryChain<LanguageType>;

    /** This function allows to create a single operator with arbitrary input operands. */
    createGeneric(typeDetails: GenericOperatorDetails): OperatorConfigurationGenericChain<LanguageType>;
}

export interface OperatorConfigurationUnaryChain<LanguageType> {
    inferenceRule<T extends LanguageType>(rule: InferOperatorWithSingleOperand<LanguageType, T>): OperatorConfigurationUnaryChain<LanguageType>;
    finish(): Array<TypeInitializer<Type, LanguageType>>;
}
export interface OperatorConfigurationBinaryChain<LanguageType> {
    inferenceRule<T extends LanguageType>(rule: InferOperatorWithMultipleOperands<LanguageType, T>): OperatorConfigurationBinaryChain<LanguageType>;
    finish(): Array<TypeInitializer<Type, LanguageType>>;
}
export interface OperatorConfigurationTernaryChain<LanguageType> {
    inferenceRule<T extends LanguageType>(rule: InferOperatorWithMultipleOperands<LanguageType, T>): OperatorConfigurationTernaryChain<LanguageType>;
    finish(): Array<TypeInitializer<Type, LanguageType>>;
}
export interface OperatorConfigurationGenericChain<LanguageType> {
    inferenceRule<T extends LanguageType>(rule: InferOperatorWithSingleOperand<LanguageType, T> | InferOperatorWithMultipleOperands<LanguageType, T>): OperatorConfigurationGenericChain<LanguageType>;
    finish(): TypeInitializer<Type, LanguageType>;
}


/**
 * This implementation realizes operators as functions and creates types of kind 'function'.
 * If Typir does not use the function kind so far, it will be automatically added.
 * (Alternative implementation strategies for operators would be a dedicated kind for operators, which might extend the 'function' kind)
 *
 * Nevertheless, there are some differences between operators and functions:
 * - Operators have no declaration.
 * - It is not possible to have references to operators.
 *
 * The same operator (i.e. same operator name, e.g. "+" or "XOR") with different types for its operands will be realized as different function types,
 * e.g. there are two functions for "+" for numbers and for strings.
 *
 * All operands are mandatory.
 */
export class DefaultOperatorFactory<LanguageType> implements OperatorFactoryService<LanguageType> {
    protected readonly services: TypirServices<LanguageType>;

    constructor(services: TypirServices<LanguageType>) {
        this.services = services;
    }

    createUnary(typeDetails: UnaryOperatorDetails): OperatorConfigurationUnaryChain<LanguageType> {
        return new OperatorConfigurationUnaryChainImpl(this.services, typeDetails);
    }

    createBinary(typeDetails: BinaryOperatorDetails): OperatorConfigurationBinaryChain<LanguageType> {
        return new OperatorConfigurationBinaryChainImpl(this.services, typeDetails);
    }

    createTernary(typeDetails: TernaryOperatorDetails): OperatorConfigurationTernaryChain<LanguageType> {
        return new OperatorConfigurationTernaryChainImpl(this.services, typeDetails);
    }

    createGeneric(typeDetails: GenericOperatorDetails): OperatorConfigurationGenericChain<LanguageType> {
        return new OperatorConfigurationGenericChainImpl(this.services, typeDetails);
    }
}


class OperatorConfigurationUnaryChainImpl<LanguageType> implements OperatorConfigurationUnaryChain<LanguageType> {
    protected readonly services: TypirServices<LanguageType>;
    protected readonly typeDetails: CreateUnaryOperatorDetails<LanguageType>;

    constructor(services: TypirServices<LanguageType>, typeDetails: UnaryOperatorDetails) {
        this.services = services;
        this.typeDetails = {
            ...typeDetails,
            inferenceRules: [],
        };
    }

    inferenceRule<T extends LanguageType>(rule: InferOperatorWithSingleOperand<LanguageType, T>): OperatorConfigurationUnaryChain<LanguageType> {
        this.typeDetails.inferenceRules.push(rule as unknown as InferOperatorWithSingleOperand<LanguageType>);
        return this;
    }

    finish(): Array<TypeInitializer<Type, LanguageType>> {
        const signatures = toSignatureArray(this.typeDetails);
        const result: Array<TypeInitializer<Type, LanguageType>> = [];
        for (const signature of signatures) {
            const generic = new OperatorConfigurationGenericChainImpl(this.services, {
                name: this.typeDetails.name,
                outputType: signature.return,
                inputParameter: [
                    { name: 'operand', type: signature.operand },
                ],
            });
            // the same inference rule is used (and required) for all overloads, since multiple FunctionTypes are created!
            this.typeDetails.inferenceRules.forEach(rule => generic.inferenceRule(rule));
            result.push(generic.finish());
        }
        return result;
    }
}

class OperatorConfigurationBinaryChainImpl<LanguageType> implements OperatorConfigurationBinaryChain<LanguageType> {
    protected readonly services: TypirServices<LanguageType>;
    protected readonly typeDetails: CreateBinaryOperatorDetails<LanguageType>;

    constructor(services: TypirServices<LanguageType>, typeDetails: BinaryOperatorDetails) {
        this.services = services;
        this.typeDetails = {
            ...typeDetails,
            inferenceRules: [],
        };
    }

    inferenceRule<T extends LanguageType>(rule: InferOperatorWithMultipleOperands<LanguageType, T>): OperatorConfigurationBinaryChain<LanguageType> {
        this.typeDetails.inferenceRules.push(rule as unknown as InferOperatorWithMultipleOperands<LanguageType>);
        return this;
    }

    finish(): Array<TypeInitializer<Type, LanguageType>> {
        const signatures = toSignatureArray(this.typeDetails);
        const result: Array<TypeInitializer<Type, LanguageType>> = [];
        for (const signature of signatures) {
            const generic = new OperatorConfigurationGenericChainImpl(this.services, {
                name: this.typeDetails.name,
                outputType: signature.return,
                inputParameter: [
                    { name: 'left', type: signature.left},
                    { name: 'right', type: signature.right},
                ],
            });
            // the same inference rule is used (and required) for all overloads, since multiple FunctionTypes are created!
            this.typeDetails.inferenceRules.forEach(rule => generic.inferenceRule(rule));
            result.push(generic.finish());
        }
        return result;
    }
}

class OperatorConfigurationTernaryChainImpl<LanguageType> implements OperatorConfigurationTernaryChain<LanguageType> {
    protected readonly services: TypirServices<LanguageType>;
    protected readonly typeDetails: CreateTernaryOperatorDetails<LanguageType>;

    constructor(services: TypirServices<LanguageType>, typeDetails: TernaryOperatorDetails) {
        this.services = services;
        this.typeDetails = {
            ...typeDetails,
            inferenceRules: [],
        };
    }

    inferenceRule<T extends LanguageType>(rule: InferOperatorWithMultipleOperands<LanguageType, T>): OperatorConfigurationTernaryChain<LanguageType> {
        this.typeDetails.inferenceRules.push(rule as unknown as InferOperatorWithMultipleOperands<LanguageType>);
        return this;
    }

    finish(): Array<TypeInitializer<Type, LanguageType>> {
        const signatures = toSignatureArray(this.typeDetails);
        const result: Array<TypeInitializer<Type, LanguageType>> = [];
        for (const signature of signatures) {
            const generic = new OperatorConfigurationGenericChainImpl(this.services, {
                name: this.typeDetails.name,
                outputType: signature.return,
                inputParameter: [
                    { name: 'first', type: signature.first },
                    { name: 'second', type: signature.second },
                    { name: 'third', type: signature.third },
                ],
            });
            // the same inference rule is used (and required) for all overloads, since multiple FunctionTypes are created!
            this.typeDetails.inferenceRules.forEach(rule => generic.inferenceRule(rule));
            result.push(generic.finish());
        }
        return result;
    }
}

class OperatorConfigurationGenericChainImpl<LanguageType> implements OperatorConfigurationGenericChain<LanguageType> {
    protected readonly services: TypirServices<LanguageType>;
    protected readonly typeDetails: CreateGenericOperatorDetails<LanguageType>;

    constructor(services: TypirServices<LanguageType>, typeDetails: GenericOperatorDetails) {
        this.services = services;
        this.typeDetails = {
            ...typeDetails,
            inferenceRules: [],
        };
    }

    inferenceRule<T extends LanguageType>(rule: InferOperatorWithSingleOperand<LanguageType, T> | InferOperatorWithMultipleOperands<LanguageType, T>): OperatorConfigurationGenericChain<LanguageType> {
        this.typeDetails.inferenceRules.push(rule as unknown as (InferOperatorWithSingleOperand<LanguageType> | InferOperatorWithMultipleOperands<LanguageType>));
        return this;
    }

    finish(): TypeInitializer<Type, LanguageType> {
        // define/register the wanted operator as "special" function
        const functionFactory = this.getFunctionFactory();
        const operatorName = this.typeDetails.name;

        // create the operator as type of kind 'function'
        const newOperatorType = functionFactory.create({
            functionName: operatorName,
            outputParameter: { name: NO_PARAMETER_NAME, type: this.typeDetails.outputType },
            inputParameters: this.typeDetails.inputParameter,
        });
        // infer the operator when the operator is called!
        for (const inferenceRule of this.typeDetails.inferenceRules) {
            newOperatorType.inferenceRuleForCalls({
                languageKey: inferenceRule.languageKey,
                filter: inferenceRule.filter ? ((languageNode: LanguageType): languageNode is LanguageType => inferenceRule.filter!(languageNode, this.typeDetails.name)) : undefined,
                matching: (languageNode: LanguageType) => inferenceRule.matching(languageNode, this.typeDetails.name),
                inputArguments: (languageNode: LanguageType) => this.getInputArguments(inferenceRule, languageNode),
                validation: toArray(inferenceRule.validation).map(validationRule =>
                    (functionCall: LanguageType, functionType: FunctionType, accept: ValidationProblemAcceptor<LanguageType>, typir: TypirServices<LanguageType>) => validationRule(functionCall, operatorName, functionType, accept, typir)),
                validateArgumentsOfFunctionCalls: inferenceRule.validateArgumentsOfCalls,
            });
        }
        // operators have no declaration in the code => no inference rule for the operator declaration!

        return newOperatorType.finish() as unknown as TypeInitializer<Type, LanguageType>;
    }

    protected getInputArguments(inferenceRule: InferOperatorWithSingleOperand<LanguageType> | InferOperatorWithMultipleOperands<LanguageType>, languageNode: LanguageType): LanguageType[] {
        return 'operands' in inferenceRule
            ? (inferenceRule as InferOperatorWithMultipleOperands<LanguageType>).operands(languageNode, this.typeDetails.name)
            : [(inferenceRule as InferOperatorWithSingleOperand<LanguageType>).operand(languageNode, this.typeDetails.name)];
    }

    protected getFunctionFactory(): FunctionFactoryService<LanguageType> {
        return this.services.factory.Functions;
    }
}


function toSignatureArray<T>(values: {
    signature?: T;
    signatures?: T[];
}): T[] {
    const result = [...toArray(values.signatures)]; // create a new array in order to prevent side-effects in the given array
    if (values.signature) {
        result.push(values.signature);
    }
    if (result.length <= 0) {
        throw new Error('At least one signature must be given!');
    }
    return result;
}
