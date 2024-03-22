/* eslint-disable header/header */

import { Type } from '../graph/type-node';
import { FUNCTION_MISSING_NAME, FunctionKind, FunctionKindName } from '../kinds/function-kind';
import { Typir } from '../typir';
import { NameTypePair } from '../utils';
import { InferConcreteType, createInferenceRule } from './inference';

// Operator as special Function? => no, operators are a "usability add-on"
// Operator as service? => yes, for now

export interface OperatorManager {
    createUnaryOperator(name: string, type: Type, inferenceRule?: InferConcreteType): Type
    createBinaryOperator(name: string, inputType: Type, outputType?: Type, inferenceRule?: InferConcreteType): Type
    createTernaryOperator(name: string, firstType: Type, secondAndThirdType: Type, inferenceRule?: InferConcreteType): Type
}

/** TODO open questions: function types VS return type
 * - function type: is the signature of the function, assignability is required for function references
 * - return type: is the type of the value after executing(!) the function, assignability is required to check, whether the produced value can be assigned!
 * */

export class DefaultOperatorManager implements OperatorManager {
    protected readonly typir: Typir;

    constructor(typir: Typir) {
        this.typir = typir;
    }

    createUnaryOperator(name: string, type: Type, inferenceRule?: InferConcreteType | undefined): Type {
        return this.createOperator(name, type, inferenceRule,
            { name: 'operand', type });
    }

    createBinaryOperator(name: string, inputType: Type, outputType?: Type, inferenceRule?: InferConcreteType): Type {
        return this.createOperator(name, outputType ?? inputType, inferenceRule,
            { name: 'left', type: inputType},
            { name: 'right', type: inputType});
    }

    createTernaryOperator(name: string, firstType: Type, secondAndThirdType: Type, inferenceRule?: InferConcreteType | undefined): Type {
        return this.createOperator(name, secondAndThirdType, inferenceRule,
            { name: 'first', type: firstType},
            { name: 'second', type: secondAndThirdType},
            { name: 'third', type: secondAndThirdType});
    }

    protected createOperator(name: string, outputType: Type, inferenceRule: InferConcreteType | undefined, ...inputParameter: NameTypePair[]): Type {
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
            this.typir.inference.addInferenceRule(createInferenceRule(inferenceRule, newOperatorType));
        }
        return newOperatorType;
    }
}
