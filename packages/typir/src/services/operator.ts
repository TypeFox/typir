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
import { NameTypePair, TypeInitializers } from '../utils/utils-definitions.js';
import { toArray } from '../utils/utils.js';
import { ValidationProblem } from './validation.js';

// export type InferOperatorWithSingleOperand = (languageNode: unknown, operatorName: string) => boolean | unknown;
export type InferOperatorWithSingleOperand<T = unknown> = {
    filter: (languageNode: unknown, operatorName: string) => languageNode is T;
    matching: (languageNode: T, operatorName: string) => boolean;
    operand: (languageNode: T, operatorName: string) => unknown;
};
// export type InferOperatorWithMultipleOperands = (languageNode: unknown, operatorName: string) => boolean | unknown[];
export type InferOperatorWithMultipleOperands<T = unknown> = {
    filter: (languageNode: unknown, operatorName: string) => languageNode is T;
    matching: (languageNode: T, operatorName: string) => boolean;
    operands: (languageNode: T, operatorName: string) => unknown[];
};

export type OperatorValidationRule<T> = (operatorCall: T, operatorName: string, operatorType: Type, typir: TypirServices) => ValidationProblem[];

export interface AnyOperatorDetails<T> {
    name: string;
    // TODO Review: should OperatorValidationRule and InferOperatorWithSingleOperand/InferOperatorWithMultipleOperands be merged/combined, since they shared the same type parameter T ?
    validationRule?: OperatorValidationRule<T>;
}

export interface UnaryOperatorDetails<T> extends AnyOperatorDetails<T> {
    signature?: UnaryOperatorSignature;
    signatures?: UnaryOperatorSignature[];
    inferenceRule?: InferOperatorWithSingleOperand<T>;
}
export interface UnaryOperatorSignature {
    operand: Type;
    return: Type;
}

export interface BinaryOperatorDetails<T> extends AnyOperatorDetails<T> {
    signature?: BinaryOperatorSignature;
    signatures?: BinaryOperatorSignature[];
    inferenceRule?: InferOperatorWithMultipleOperands<T>;
}
export interface BinaryOperatorSignature {
    left: Type;
    right: Type;
    return: Type;
}

export interface TernaryOperatorDetails<T> extends AnyOperatorDetails<T> {
    signature?: TernaryOperatorSignature;
    signatures?: TernaryOperatorSignature[];
    inferenceRule?: InferOperatorWithMultipleOperands<T>;
}
export interface TernaryOperatorSignature {
    first: Type;
    second: Type;
    third: Type;
    return: Type;
}

export interface GenericOperatorDetails<T> extends AnyOperatorDetails<T> {
    outputType: Type;
    inputParameter: NameTypePair[];
    inferenceRule?: InferOperatorWithSingleOperand<T> | InferOperatorWithMultipleOperands<T>;
}

export interface OperatorFactoryService {
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
export class DefaultOperatorFactory implements OperatorFactoryService {
    protected readonly services: TypirServices;

    constructor(services: TypirServices) {
        this.services = services;
    }

    createUnary<T>(typeDetails: UnaryOperatorDetails<T>): TypeInitializers<Type> {
        const signatures = toSignatureArray(typeDetails);
        const result: Array<TypeInitializer<Type>> = [];
        for (const signature of signatures) {
            result.push(this.createGeneric({
                name: typeDetails.name,
                outputType: signature.return,
                inferenceRule: typeDetails.inferenceRule, // the same inference rule is used (and required) for all overloads, since multiple FunctionTypes are created!
                inputParameter: [
                    { name: 'operand', type: signature.operand },
                ],
                validationRule: typeDetails.validationRule,
            }));
        }
        return result.length === 1 ? result[0] : result;
    }

    createBinary<T>(typeDetails: BinaryOperatorDetails<T>): TypeInitializers<Type> {
        const signatures = toSignatureArray(typeDetails);
        const result: Array<TypeInitializer<Type>> = [];
        for (const signature of signatures) {
            result.push(this.createGeneric({
                name: typeDetails.name,
                outputType: signature.return,
                inferenceRule: typeDetails.inferenceRule, // the same inference rule is used (and required) for all overloads, since multiple FunctionTypes are created!
                inputParameter: [
                    { name: 'left', type: signature.left},
                    { name: 'right', type: signature.right}
                ],
                validationRule: typeDetails.validationRule,
            }));
        }
        return result.length === 1 ? result[0] : result;
    }

    createTernary<T>(typeDetails: TernaryOperatorDetails<T>): TypeInitializers<Type> {
        const signatures = toSignatureArray(typeDetails);
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
                ],
                validationRule: typeDetails.validationRule,
            }));
        }
        return result.length === 1 ? result[0] : result;
    }

    createGeneric<T>(typeDetails: GenericOperatorDetails<T>): TypeInitializer<Type> {
        // define/register the wanted operator as "special" function
        const functionFactory = this.getFunctionFactory();
        const operatorName = typeDetails.name;

        // create the operator as type of kind 'function'
        const newOperatorType = functionFactory.create({
            functionName: operatorName,
            outputParameter: { name: NO_PARAMETER_NAME, type: typeDetails.outputType },
            inputParameters: typeDetails.inputParameter,
            inferenceRuleForDeclaration: undefined, // operators have no declaration in the code => no inference rule for the operator declaration!
            inferenceRuleForCalls: typeDetails.inferenceRule // but infer the operator when the operator is called!
                ? {
                    filter: (languageNode: unknown): languageNode is T => typeDetails.inferenceRule!.filter(languageNode, typeDetails.name),
                    matching: (languageNode: T) => typeDetails.inferenceRule!.matching(languageNode, typeDetails.name),
                    inputArguments: (languageNode: T) => this.getInputArguments(typeDetails, languageNode),
                }
                : undefined,
            validationForCall: typeDetails.validationRule
                ? (functionCall: T, functionType: FunctionType, typir: TypirServices) => typeDetails.validationRule!(functionCall, operatorName, functionType, typir)
                : undefined,
        });

        return newOperatorType as unknown as TypeInitializer<Type>;
    }

    protected getInputArguments<T>(typeDetails: GenericOperatorDetails<T>, languageNode: unknown): unknown[] {
        return 'operands' in typeDetails.inferenceRule!
            ? (typeDetails.inferenceRule as InferOperatorWithMultipleOperands).operands(languageNode, typeDetails.name)
            : [(typeDetails.inferenceRule as InferOperatorWithSingleOperand).operand(languageNode, typeDetails.name)];
    }

    protected getFunctionFactory(): FunctionFactoryService {
        return this.services.factory.Functions;
    }
}

function toSignatureArray<T>(values: {
    signature?: T;
    signatures?: T[];
}): T[] {
    const result = toArray(values.signatures);
    if (values.signature) {
        result.push(values.signature);
    }
    if (result.length <= 0) {
        throw new Error('At least one signature must be given!');
    }
    return result;
}
