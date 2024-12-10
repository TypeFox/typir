/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type } from '../graph/type-node.js';
import { TypeInitializer } from '../initialization/type-initializer.js';
import { FunctionPredefinedService, NO_PARAMETER_NAME } from '../kinds/function/function-kind.js';
import { TypirServices } from '../typir.js';
import { NameTypePair, TypeInitializers } from '../utils/utils-definitions.js';
import { toArray } from '../utils/utils.js';

// export type InferOperatorWithSingleOperand = (domainElement: unknown, operatorName: string) => boolean | unknown;
export type InferOperatorWithSingleOperand<T = unknown> = {
    filter: (domainElement: unknown, operatorName: string) => domainElement is T;
    matching: (domainElement: T, operatorName: string) => boolean;
    operand: (domainElement: T, operatorName: string) => unknown;
};
// export type InferOperatorWithMultipleOperands = (domainElement: unknown, operatorName: string) => boolean | unknown[];
export type InferOperatorWithMultipleOperands<T = unknown> = {
    filter: (domainElement: unknown, operatorName: string) => domainElement is T;
    matching: (domainElement: T, operatorName: string) => boolean;
    operands: (domainElement: T, operatorName: string) => unknown[];
};

export interface UnaryOperatorDetails<T> {
    name: string;
    signature: UnaryOperatorSignature | UnaryOperatorSignature[];
    inferenceRule?: InferOperatorWithSingleOperand<T>;
}
export interface UnaryOperatorSignature {
    operand: Type;
    return: Type;
}

export interface BinaryOperatorDetails<T> {
    name: string;
    signature: BinaryOperatorSignature | BinaryOperatorSignature[];
    inferenceRule?: InferOperatorWithMultipleOperands<T>;
}
export interface BinaryOperatorSignature {
    left: Type;
    right: Type;
    return: Type;
}

export interface TernaryOperatorDetails<T> {
    name: string;
    signature: TernaryOperatorSignature | TernaryOperatorSignature[];
    inferenceRule?: InferOperatorWithMultipleOperands<T>;
}
export interface TernaryOperatorSignature {
    first: Type;
    second: Type;
    third: Type;
    return: Type;
}

export interface GenericOperatorDetails<T> {
    name: string;
    outputType: Type;
    inputParameter: NameTypePair[];
    inferenceRule?: InferOperatorWithSingleOperand<T> | InferOperatorWithMultipleOperands<T>;
}

// TODO rename it to "OperatorFactory", when there are no more responsibilities!
export interface OperatorManager {
    createUnary<T>(typeDetails: UnaryOperatorDetails<T>): TypeInitializers<Type>
    createBinary<T>(typeDetails: BinaryOperatorDetails<T>): TypeInitializers<Type>
    createTernary<T>(typeDetails: TernaryOperatorDetails<T>): TypeInitializers<Type>

    /** This function allows to create a single operator with arbitrary input operands. */
    createGeneric<T>(typeDetails: GenericOperatorDetails<T>): TypeInitializer<Type>;
}

/**
 * Alternative implementation strategies for operators would be
 * - a dedicated kind for operators, which might extend the 'function' kind
 * */

/**
 * This implementation realizes operators as functions and creates types of kind 'function'.
 * If Typir does not use the function kind so far, it will be automatically added.
 * There are some differences between operators and functions: operators have no declaration, it is not possible to have references to operators
 *
 * The same operator (i.e. same operator name, e.g. "+" or "and") with different types for its operands will be realized as different function types,
 * e.g. there are two functions for "+" for numbers and for strings.
 *
 * When specifying multiple names, for each name one operator is created with the given type (variant)s.
 * This allows to define multiple operators with the same signature (input and output types), but different names at once.
 *
 * All operands are mandatory.
 */
export class DefaultOperatorManager implements OperatorManager {
    protected readonly services: TypirServices;

    constructor(services: TypirServices) {
        this.services = services;
    }

    createUnary<T>(typeDetails: UnaryOperatorDetails<T>): TypeInitializers<Type> {
        const signatures = toArray(typeDetails.signature);
        const result: Array<TypeInitializer<Type>> = [];
        for (const signature of signatures) {
            result.push(this.createGeneric({
                name: typeDetails.name,
                outputType: signature.return,
                inferenceRule: typeDetails.inferenceRule, // the same inference rule is used (and required) for all overloads, since multiple FunctionTypes are created!
                inputParameter: [
                    { name: 'operand', type: signature.operand },
                ]
            }));
        }
        return result.length === 1 ? result[0] : result;
    }

    createBinary<T>(typeDetails: BinaryOperatorDetails<T>): TypeInitializers<Type> {
        const signatures = toArray(typeDetails.signature);
        const result: Array<TypeInitializer<Type>> = [];
        for (const signature of signatures) {
            result.push(this.createGeneric({
                name: typeDetails.name,
                outputType: signature.return,
                inferenceRule: typeDetails.inferenceRule, // the same inference rule is used (and required) for all overloads, since multiple FunctionTypes are created!
                inputParameter: [
                    { name: 'left', type: signature.left},
                    { name: 'right', type: signature.right}
                ]
            }));
        }
        return result.length === 1 ? result[0] : result;
    }

    createTernary<T>(typeDetails: TernaryOperatorDetails<T>): TypeInitializers<Type> {
        const signatures = toArray(typeDetails.signature);
        const result: Array<TypeInitializer<Type>> = [];
        for (const signature of signatures) {
            result.push(this.createGeneric({
                name: typeDetails.name,
                outputType: signature.return,
                inferenceRule: typeDetails.inferenceRule, // the same inference rule is used (and required) for all overloads, since multiple FunctionTypes are created!
                inputParameter: [
                    { name: 'first', type: signature.first },
                    { name: 'second', type: signature.second },
                    { name: 'third', type: signature.third },
                ]
            }));
        }
        return result.length === 1 ? result[0] : result;
    }

    createGeneric<T>(typeDetails: GenericOperatorDetails<T>): TypeInitializer<Type> {
        // define/register the wanted operator as "special" function
        const functionKind = this.getFunctionFactory();

        // create the operator as type of kind 'function'
        const newOperatorType = functionKind.create({
            functionName: typeDetails.name,
            outputParameter: { name: NO_PARAMETER_NAME, type: typeDetails.outputType },
            inputParameters: typeDetails.inputParameter,
            inferenceRuleForDeclaration: undefined, // operators have no declaration in the code => no inference rule for the operator declaration!
            inferenceRuleForCalls: typeDetails.inferenceRule // but infer the operator when the operator is called!
                ? {
                    filter: (domainElement: unknown): domainElement is T => typeDetails.inferenceRule!.filter(domainElement, typeDetails.name),
                    matching: (domainElement: T) => typeDetails.inferenceRule!.matching(domainElement, typeDetails.name),
                    inputArguments: (domainElement: T) => 'operands' in typeDetails.inferenceRule!
                        ? (typeDetails.inferenceRule as InferOperatorWithMultipleOperands).operands(domainElement, typeDetails.name)
                        : [(typeDetails.inferenceRule as InferOperatorWithSingleOperand).operand(domainElement, typeDetails.name)],
                }
                : undefined
        });

        return newOperatorType as unknown as TypeInitializer<Type>;
    }

    protected getFunctionFactory(): FunctionPredefinedService {
        return this.services.factory.functions;
    }
}
