/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type } from '../graph/type-node.js';
import { FUNCTION_MISSING_NAME, FunctionKind, FunctionKindName } from '../kinds/function-kind.js';
import { Typir } from '../typir.js';
import { NameTypePair, assertTrue } from '../utils.js';
import { InferConcreteType } from './inference.js';

// Operator as special Function? => no, operators are a "usability add-on"
// Operator as service? => yes, for now

export interface OperatorManager {
    createUnaryOperator(name: string, type: Type,
        inferenceRule?: InferConcreteType,
        childWithSameType?: (domainElement: unknown) => unknown): Type
    createBinaryOperator(name: string, inputType: Type, outputType?: Type,
        inferenceRule?: InferConcreteType,
        childWithSameType?: (domainElement: unknown) => unknown[]): Type
    createTernaryOperator(name: string, firstType: Type, secondAndThirdType: Type,
        inferenceRule?: InferConcreteType,
        childWithSameType?: (domainElement: unknown) => unknown[]): Type

    // e.g. for non-symmetric operators!
    createGenericOperator(name: string, outputType: Type,
        inferenceRule: InferConcreteType | undefined,
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
 * */

export class DefaultOperatorManager implements OperatorManager {
    protected readonly typir: Typir;

    constructor(typir: Typir) {
        this.typir = typir;
    }

    createUnaryOperator(name: string, type: Type, inferenceRule?: InferConcreteType | undefined, childWithSameType?: (domainElement: unknown) => unknown): Type {
        return this.createGenericOperator(name, type, inferenceRule,
            childWithSameType,
            { name: 'operand', type });
    }

    createBinaryOperator(name: string, inputType: Type, outputType?: Type, inferenceRule?: InferConcreteType, childWithSameType?: (domainElement: unknown) => unknown[]): Type {
        return this.createGenericOperator(name, outputType ?? inputType, inferenceRule,
            childWithSameType,
            { name: 'left', type: inputType},
            { name: 'right', type: inputType});
    }

    createTernaryOperator(name: string, firstType: Type, secondAndThirdType: Type, inferenceRule?: InferConcreteType | undefined, childWithSameType?: (domainElement: unknown) => unknown[]): Type {
        return this.createGenericOperator(name, secondAndThirdType, inferenceRule,
            childWithSameType,
            { name: 'first', type: firstType},
            { name: 'second', type: secondAndThirdType},
            { name: 'third', type: secondAndThirdType});
    }

    createGenericOperator(name: string, outputType: Type, inferenceRule: InferConcreteType | undefined, childrenWithSameType?: (domainElement: unknown) => (unknown | unknown[]), ...inputParameter: NameTypePair[]): Type {
        // define/register the wanted operator as "special" function
        let functionKind: FunctionKind | undefined = this.typir.getKind(FunctionKindName) as FunctionKind;
        if (!functionKind) {
            functionKind = new FunctionKind(this.typir);
        }
        const newOperatorType = functionKind.createFunctionType(name,
            { name: FUNCTION_MISSING_NAME, type: outputType },
            ...inputParameter,
        );
        // register a dedicated inference rule for this operator
        if (inferenceRule) {
            // this.typir.inference.addInferenceRule(createInferenceRuleWithoutChildren(inferenceRule, newOperatorType));
            const typirr: Typir = this.typir;
            this.typir.inference.addInferenceRule({
                isRuleApplicable(domainElement) {
                    return inferenceRule(domainElement) ? true : false;
                },
                getElementsToInferBefore(domainElement) {
                    const r = childrenWithSameType ? childrenWithSameType(domainElement) : [];
                    if (Array.isArray(r)) {
                        return r;
                    } else {
                        return [r];
                    }
                },
                inferType(domainElement, childrenTypes) {
                    assertTrue(inputParameter.length === childrenTypes.length);
                    for (let index = 0; index < inputParameter.length; index++) {
                        const actual = childrenTypes[index];
                        const expected = inputParameter[index]; // TODO was ist mit optionalen/fehlenden Parametern usw.?
                        if (!actual || !expected || typirr.equality.areTypesEqual(actual, expected.type) === false) {
                            return undefined;
                        }
                    }
                    return newOperatorType; // TODO diesen Wert cachen?
                },
            });
        }
        return newOperatorType;
    }
}
