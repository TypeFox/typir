/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type } from '../graph/type-node.js';
import { FUNCTION_MISSING_NAME, FunctionKind, FunctionKindName } from '../kinds/function-kind.js';
import { Typir } from '../typir.js';
import { NameTypePair, Types, assertTrue, toArray } from '../utils.js';
import { InferConcreteType } from './inference.js';

export interface OperatorManager {
    createUnaryOperator(name: string, operandTypes: Types,
        inferenceRule?: InferConcreteType,
        childWithSameType?: (domainElement: unknown) => unknown): Types
    createBinaryOperator(name: string, inputType: Types, outputType?: Type,
        inferenceRule?: InferConcreteType,
        childWithSameType?: (domainElement: unknown) => unknown[]): Types
    createTernaryOperator(name: string, firstType: Type, secondAndThirdType: Types,
        inferenceRule?: InferConcreteType,
        childWithSameType?: (domainElement: unknown) => unknown[]): Types

    /** This function allows to create operators with arbitrary input operands,
     * e.g. un/bin/ternary operators with asymetric operand types.
     */
    createGenericOperator(name: string, outputType: Type,
        inferenceRule?: InferConcreteType | undefined,
        childrenWithSameType?: (domainElement: unknown) => (unknown | unknown[]),
        ...inputParameter: NameTypePair[]): Type;
}

/** TODO open questions:
 *
 * function type VS return type
 * - function type: is the signature of the function, assignability is required for function references
 * - return type: is the type of the value after executing(!) the function, assignability is required to check, whether the produced value can be assigned!
 *
 * are the two "equals" operators the same operator?
 * - at least, that are two different types/signatures!
 * - two different inference rules as well?
 *
 * Alternative implementation strategies for operators would be
 * - a dedicated kind for operators, which might extend the 'function' kind
 * */

/**
 * This implementation realizes operators as functions and creates types of kind 'function'.
 * If Typir does not use the function kind so far, it will be automatically added.
 */
export class DefaultOperatorManager implements OperatorManager {
    protected readonly typir: Typir;

    constructor(typir: Typir) {
        this.typir = typir;
    }

    createUnaryOperator(name: string, operandTypes: Types, inferenceRule?: InferConcreteType | undefined, childWithSameType?: (domainElement: unknown) => unknown): Types {
        return this.handleTypeVariants(operandTypes, (singleType) => this.createGenericOperator(
            name, singleType, inferenceRule,
            childWithSameType,
            { name: 'operand', type: singleType }));
    }

    createBinaryOperator(name: string, inputType: Types, outputType?: Type, inferenceRule?: InferConcreteType, childWithSameType?: (domainElement: unknown) => unknown[]): Types {
        return this.handleTypeVariants(inputType, (singleType) => this.createGenericOperator(
            name, outputType ?? singleType, inferenceRule,
            childWithSameType,
            { name: 'left', type: singleType},
            { name: 'right', type: singleType}));
    }

    createTernaryOperator(name: string, firstType: Type, secondAndThirdType: Types, inferenceRule?: InferConcreteType | undefined, childWithSameType?: (domainElement: unknown) => unknown[]): Types {
        return this.handleTypeVariants(secondAndThirdType, (singleType) => this.createGenericOperator(
            name, singleType, inferenceRule,
            childWithSameType,
            { name: 'first', type: firstType},
            { name: 'second', type: singleType},
            { name: 'third', type: singleType}));
    }

    protected handleTypeVariants(typeVariants: Types, typeCreator: (singleType: Type) => Type): Types {
        const allTypes = toArray(typeVariants);
        assertTrue(allTypes.length >= 1);
        const result: Type[] = [];
        for (const singleType of allTypes) {
            result.push(typeCreator(singleType));
        }
        return result.length === 1 ? result[0] : result;
    }

    createGenericOperator(name: string, outputType: Type, inferenceRule?: InferConcreteType | undefined, childrenWithSameType?: (domainElement: unknown) => (unknown | unknown[]), ...inputParameter: NameTypePair[]): Type {
        // define/register the wanted operator as "special" function

        // ensure, that Typir uses the predefined 'function' kind
        let functionKind: FunctionKind | undefined = this.typir.getKind(FunctionKindName) as FunctionKind;
        if (!functionKind) {
            functionKind = new FunctionKind(this.typir);
        }

        // create the operator as type of kind 'function'
        const newOperatorType = functionKind.createFunctionType(name,
            { name: FUNCTION_MISSING_NAME, type: outputType },
            ...inputParameter,
        );

        // register a dedicated inference rule for this operator
        if (inferenceRule) {
            const typirr: Typir = this.typir;
            this.typir.inference.addInferenceRule({
                isRuleApplicable(domainElement) {
                    return inferenceRule(domainElement) ? true : false;
                },
                getElementsToInferBefore(domainElement) {
                    return toArray(childrenWithSameType ? childrenWithSameType(domainElement) : []);
                },
                inferType(domainElement, childrenTypes) {
                    assertTrue(inputParameter.length === childrenTypes.length);
                    for (let index = 0; index < inputParameter.length; index++) {
                        const actual = childrenTypes[index];
                        const expected = inputParameter[index].type; // TODO was ist mit optionalen/fehlenden Parametern usw.?
                        if (!actual || !expected || typirr.equality.areTypesEqual(actual, expected) === false) {
                            return undefined;
                        }
                    }
                    // all operands have the required types => return the return type of the operator/function
                    return functionKind!.getOutput(newOperatorType)?.type;
                    // TODO what to do, when the Signature type of the operator is required, e.g. for a reference to the operator/function itself ??
                },
            });
        }
        return newOperatorType;
    }
}
