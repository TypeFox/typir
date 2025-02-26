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
import { ValidationProblem } from './validation.js';

export type InferOperatorWithSingleOperand<T = unknown> = {
    languageKey?: string;
    filter?: (languageNode: unknown, operatorName: string) => languageNode is T;
    matching: (languageNode: T, operatorName: string) => boolean;
    operand: (languageNode: T, operatorName: string) => unknown;
    validation?: OperatorValidationRule<T> | Array<OperatorValidationRule<T>>;
    validateArgumentsOfCalls?: boolean | ((languageNode: T) => boolean);
};
export type InferOperatorWithMultipleOperands<T = unknown> = {
    languageKey?: string;
    filter?: (languageNode: unknown, operatorName: string) => languageNode is T;
    matching: (languageNode: T, operatorName: string) => boolean;
    operands: (languageNode: T, operatorName: string) => unknown[];
    validation?: OperatorValidationRule<T> | Array<OperatorValidationRule<T>>;
    validateArgumentsOfCalls?: boolean | ((languageNode: T) => boolean);
};

export type OperatorValidationRule<T> = (operatorCall: T, operatorName: string, operatorType: Type, typir: TypirServices) => ValidationProblem[];

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
interface CreateUnaryOperatorDetails extends UnaryOperatorDetails { // only internally used for collecting all information with the chaining API
    inferenceRules: Array<InferOperatorWithSingleOperand<unknown>>;
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
interface CreateBinaryOperatorDetails extends BinaryOperatorDetails { // only internally used for collecting all information with the chaining API
    inferenceRules: Array<InferOperatorWithMultipleOperands<unknown>>;
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
interface CreateTernaryOperatorDetails extends TernaryOperatorDetails { // only internally used for collecting all information with the chaining API
    inferenceRules: Array<InferOperatorWithMultipleOperands<unknown>>;
}

export interface GenericOperatorDetails extends AnyOperatorDetails {
    outputType: Type;
    inputParameter: NameTypePair[];
}
interface CreateGenericOperatorDetails extends GenericOperatorDetails { // only internally used for collecting all information with the chaining API
    inferenceRules: Array<InferOperatorWithSingleOperand<unknown> | InferOperatorWithMultipleOperands<unknown>>;
}

export interface OperatorFactoryService {
    createUnary(typeDetails: UnaryOperatorDetails): OperatorConfigurationUnaryChain;
    createBinary(typeDetails: BinaryOperatorDetails): OperatorConfigurationBinaryChain;
    createTernary(typeDetails: TernaryOperatorDetails): OperatorConfigurationTernaryChain;

    /** This function allows to create a single operator with arbitrary input operands. */
    createGeneric(typeDetails: GenericOperatorDetails): OperatorConfigurationGenericChain;
}

export interface OperatorConfigurationUnaryChain {
    inferenceRule<T>(rule: InferOperatorWithSingleOperand<T>): OperatorConfigurationUnaryChain;
    finish(): Array<TypeInitializer<Type>>;
}
export interface OperatorConfigurationBinaryChain {
    inferenceRule<T>(rule: InferOperatorWithMultipleOperands<T>): OperatorConfigurationBinaryChain;
    finish(): Array<TypeInitializer<Type>>;
}
export interface OperatorConfigurationTernaryChain {
    inferenceRule<T>(rule: InferOperatorWithMultipleOperands<T>): OperatorConfigurationTernaryChain;
    finish(): Array<TypeInitializer<Type>>;
}
export interface OperatorConfigurationGenericChain {
    inferenceRule<T>(rule: InferOperatorWithSingleOperand<T> | InferOperatorWithMultipleOperands<T>): OperatorConfigurationGenericChain;
    finish(): TypeInitializer<Type>;
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
export class DefaultOperatorFactory implements OperatorFactoryService {
    protected readonly services: TypirServices;

    constructor(services: TypirServices) {
        this.services = services;
    }

    createUnary(typeDetails: UnaryOperatorDetails): OperatorConfigurationUnaryChain {
        return new OperatorConfigurationUnaryChainImpl(this.services, typeDetails);
    }

    createBinary(typeDetails: BinaryOperatorDetails): OperatorConfigurationBinaryChain {
        return new OperatorConfigurationBinaryChainImpl(this.services, typeDetails);
    }

    createTernary(typeDetails: TernaryOperatorDetails): OperatorConfigurationTernaryChain {
        return new OperatorConfigurationTernaryChainImpl(this.services, typeDetails);
    }

    createGeneric(typeDetails: GenericOperatorDetails): OperatorConfigurationGenericChain {
        return new OperatorConfigurationGenericChainImpl(this.services, typeDetails);
    }
}


class OperatorConfigurationUnaryChainImpl implements OperatorConfigurationUnaryChain {
    protected readonly services: TypirServices;
    protected readonly typeDetails: CreateUnaryOperatorDetails;

    constructor(services: TypirServices, typeDetails: UnaryOperatorDetails) {
        this.services = services;
        this.typeDetails = {
            ...typeDetails,
            inferenceRules: [],
        };
    }

    inferenceRule<T>(rule: InferOperatorWithSingleOperand<T>): OperatorConfigurationUnaryChain {
        this.typeDetails.inferenceRules.push(rule as InferOperatorWithSingleOperand<unknown>);
        return this;
    }

    finish(): Array<TypeInitializer<Type>> {
        const signatures = toSignatureArray(this.typeDetails);
        const result: Array<TypeInitializer<Type>> = [];
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

class OperatorConfigurationBinaryChainImpl implements OperatorConfigurationBinaryChain {
    protected readonly services: TypirServices;
    protected readonly typeDetails: CreateBinaryOperatorDetails;

    constructor(services: TypirServices, typeDetails: BinaryOperatorDetails) {
        this.services = services;
        this.typeDetails = {
            ...typeDetails,
            inferenceRules: [],
        };
    }

    inferenceRule<T>(rule: InferOperatorWithMultipleOperands<T>): OperatorConfigurationBinaryChain {
        this.typeDetails.inferenceRules.push(rule as InferOperatorWithMultipleOperands<unknown>);
        return this;
    }

    finish(): Array<TypeInitializer<Type>> {
        const signatures = toSignatureArray(this.typeDetails);
        const result: Array<TypeInitializer<Type>> = [];
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

class OperatorConfigurationTernaryChainImpl implements OperatorConfigurationTernaryChain {
    protected readonly services: TypirServices;
    protected readonly typeDetails: CreateTernaryOperatorDetails;

    constructor(services: TypirServices, typeDetails: TernaryOperatorDetails) {
        this.services = services;
        this.typeDetails = {
            ...typeDetails,
            inferenceRules: [],
        };
    }

    inferenceRule<T>(rule: InferOperatorWithMultipleOperands<T>): OperatorConfigurationBinaryChain {
        this.typeDetails.inferenceRules.push(rule as InferOperatorWithMultipleOperands<unknown>);
        return this;
    }

    finish(): Array<TypeInitializer<Type>> {
        const signatures = toSignatureArray(this.typeDetails);
        const result: Array<TypeInitializer<Type>> = [];
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

class OperatorConfigurationGenericChainImpl implements OperatorConfigurationGenericChain {
    protected readonly services: TypirServices;
    protected readonly typeDetails: CreateGenericOperatorDetails;

    constructor(services: TypirServices, typeDetails: GenericOperatorDetails) {
        this.services = services;
        this.typeDetails = {
            ...typeDetails,
            inferenceRules: [],
        };
    }

    inferenceRule<T>(rule: InferOperatorWithSingleOperand<T> | InferOperatorWithMultipleOperands<T>): OperatorConfigurationGenericChain {
        this.typeDetails.inferenceRules.push(rule as (InferOperatorWithSingleOperand<unknown> | InferOperatorWithMultipleOperands<unknown>));
        return this;
    }

    finish(): TypeInitializer<Type> {
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
                filter: inferenceRule.filter ? ((languageNode: unknown): languageNode is unknown => inferenceRule.filter!(languageNode, this.typeDetails.name)) : undefined,
                matching: (languageNode: unknown) => inferenceRule.matching(languageNode, this.typeDetails.name),
                inputArguments: (languageNode: unknown) => this.getInputArguments(inferenceRule, languageNode),
                validation: toArray(inferenceRule.validation).map(validationRule =>
                    (functionCall: unknown, functionType: FunctionType, typir: TypirServices) => validationRule(functionCall, operatorName, functionType, typir)),
                validateArgumentsOfFunctionCalls: inferenceRule.validateArgumentsOfCalls,
            });
        }
        // operators have no declaration in the code => no inference rule for the operator declaration!

        return newOperatorType.finish() as unknown as TypeInitializer<Type>;
    }

    protected getInputArguments(inferenceRule: InferOperatorWithSingleOperand<unknown> | InferOperatorWithMultipleOperands<unknown>, languageNode: unknown): unknown[] {
        return 'operands' in inferenceRule
            ? (inferenceRule as InferOperatorWithMultipleOperands).operands(languageNode, this.typeDetails.name)
            : [(inferenceRule as InferOperatorWithSingleOperand).operand(languageNode, this.typeDetails.name)];
    }

    protected getFunctionFactory(): FunctionFactoryService {
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
