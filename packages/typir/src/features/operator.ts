/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type } from '../graph/type-node.js';
import { FUNCTION_MISSING_NAME, FunctionKind, FunctionKindName, isFunctionKind } from '../kinds/function-kind.js';
import { Typir } from '../typir.js';
import { NameTypePair, Names, Types, assertTrue, toArray } from '../utils/utils.js';

export type InferOperatorUseSingleOperand = (domainElement: unknown, operatorName: string) => boolean | unknown;
export type InferOperatorUseMultipleOperands = (domainElement: unknown, operatorName: string) => boolean | unknown[];

export interface OperatorManager {
    createUnaryOperator(typeDetails: {
        name: Names,
        operandType: Types,
        inferenceRule?: InferOperatorUseSingleOperand
    }): Types
    createBinaryOperator(typeDetails: {
        name: Names,
        inputType: Types,
        /** If the output type is not specified, the input type is used for the output as well. */
        outputType?: Type,
        inferenceRule?: InferOperatorUseMultipleOperands
    }): Types
    createTernaryOperator(typeDetails: {
        name: Names,
        firstType: Type,
        secondAndThirdType: Types,
        inferenceRule?: InferOperatorUseMultipleOperands
    }): Types

    /** This function allows to create operators with arbitrary input operands,
     * e.g. un/bin/ternary operators with asymetric operand types.
     */
    createGenericOperator(typeDetails: {
        name: string,
        outputType: Type,
        inferenceRule?: InferOperatorUseMultipleOperands,
        inputParameter: NameTypePair[]
    }): Type;
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
    protected readonly typir: Typir;

    constructor(typir: Typir) {
        this.typir = typir;
    }

    createUnaryOperator(typeDetails: { name: Names, operandType: Types, inferenceRule?: InferOperatorUseSingleOperand }): Types {
        return this.handleOperatorVariants(typeDetails.name, typeDetails.operandType, (singleName, singleType) => this.createGenericOperator({
            name: singleName,
            outputType: singleType,
            inferenceRule: typeDetails.inferenceRule,
            inputParameter: [
                { name: 'operand', type: singleType }
            ]
        }));
    }

    createBinaryOperator(typeDetails: { name: Names, inputType: Types, outputType?: Type, inferenceRule?: InferOperatorUseMultipleOperands }): Types {
        return this.handleOperatorVariants(typeDetails.name, typeDetails.inputType, (singleName, singleType) => this.createGenericOperator({
            name: singleName,
            outputType: typeDetails.outputType ?? singleType,
            inferenceRule: typeDetails.inferenceRule,
            inputParameter: [
                { name: 'left', type: singleType},
                { name: 'right', type: singleType}
            ]
        }));
    }

    createTernaryOperator(typeDetails: { name: Names, firstType: Type, secondAndThirdType: Types, inferenceRule?: InferOperatorUseMultipleOperands }): Types {
        return this.handleOperatorVariants(typeDetails.name, typeDetails.secondAndThirdType, (singleName, singleType) => this.createGenericOperator({
            name: singleName,
            outputType: singleType,
            inferenceRule: typeDetails.inferenceRule,
            inputParameter: [
                { name: 'first', type: typeDetails.firstType},
                { name: 'second', type: singleType},
                { name: 'third', type: singleType}
            ]
        }));
    }

    protected handleOperatorVariants(nameVariants: Names, inputTypeVariants: Types, operatorTypeCreator: (singleName: string, singleInputType: Type) => Type): Types {
        const allNames = toArray(nameVariants);
        const allTypes = toArray(inputTypeVariants);
        assertTrue(allTypes.length >= 1);
        const result: Type[] = [];
        for (const singleName of allNames) {
            for (const singleType of allTypes) {
                result.push(operatorTypeCreator(singleName, singleType));
            }
        }
        return result.length === 1 ? result[0] : result;
    }

    createGenericOperator(typeDetails: { name: string, outputType: Type, inferenceRule?: (InferOperatorUseSingleOperand | InferOperatorUseMultipleOperands), inputParameter: NameTypePair[] }): Type {
        // define/register the wanted operator as "special" function

        // ensure, that Typir uses the predefined 'function' kind
        const kind = this.typir.getKind(FunctionKindName);
        const functionKind = isFunctionKind(kind) ? kind : new FunctionKind(this.typir);

        // create the operator as type of kind 'function'
        const newOperatorType = functionKind.createFunctionType({
            functionName: typeDetails.name,
            outputParameter: { name: FUNCTION_MISSING_NAME, type: typeDetails.outputType },
            inputParameters: typeDetails.inputParameter,
            inferenceRuleForDeclaration: undefined, // operators have no declaration in the code => no inference rule for the operator declaration!
            inferenceRuleForCalls: typeDetails.inferenceRule // but infer the operator when the operator is called!
                ? ((domainElement: unknown) => {
                    const inferenceResult = typeDetails.inferenceRule!(domainElement, typeDetails.name);
                    if (typeof inferenceResult === 'boolean') {
                        return inferenceResult; // true or false (directly, not within an array)
                    } else {
                        return toArray(inferenceResult); // the operands whose types need to be inferred first (in an array)
                    }
                })
                : undefined
        });

        return newOperatorType;
    }
}
