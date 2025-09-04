/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type } from '../graph/type-node.js';
import { TypeInitializer } from '../initialization/type-initializer.js';
import { FunctionFactoryService, NO_PARAMETER_NAME } from '../kinds/function/function-kind.js';
import { FunctionType } from '../kinds/function/function-type.js';
import { LanguageKeys, TypirServices, TypirSpecifics } from '../typir.js';
import { NameTypePair } from '../utils/utils-definitions.js';
import { toArray } from '../utils/utils.js';
import { ValidationProblemAcceptor } from './validation.js';

export interface InferOperatorWithSingleOperand<Specifics extends TypirSpecifics, T extends Specifics['LanguageType'] = Specifics['LanguageType']> {
    languageKey?: string | string[];
    filter?: (languageNode: Specifics['LanguageType'], operatorName: string) => languageNode is T;
    matching: (languageNode: T, operatorName: string) => boolean;
    operand: (languageNode: T, operatorName: string) => Specifics['LanguageType'];
    validation?: OperatorValidationRule<FunctionType, Specifics, T> | Array<OperatorValidationRule<FunctionType, Specifics, T>>;
    validateArgumentsOfCalls?: boolean | ((languageNode: T) => boolean);
}
export interface InferOperatorWithMultipleOperands<Specifics extends TypirSpecifics, T extends Specifics['LanguageType'] = Specifics['LanguageType']> {
    languageKey?: string | string[];
    filter?: (languageNode: Specifics['LanguageType'], operatorName: string) => languageNode is T;
    matching: (languageNode: T, operatorName: string) => boolean;
    operands: (languageNode: T, operatorName: string) => Array<Specifics['LanguageType']>;
    validation?: OperatorValidationRule<FunctionType, Specifics, T> | Array<OperatorValidationRule<FunctionType, Specifics, T>>;
    validateArgumentsOfCalls?: boolean | ((languageNode: T) => boolean);
}

export type OperatorValidationRule<OperatorType extends Type, Specifics extends TypirSpecifics, T extends Specifics['LanguageType'] = Specifics['LanguageType']> =
    (operatorCall: T, operatorName: string, operatorType: OperatorType, accept: ValidationProblemAcceptor<Specifics>, typir: TypirServices<Specifics>) => void;

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
interface CreateUnaryOperatorDetails<Specifics extends TypirSpecifics> extends UnaryOperatorDetails { // only internally used for collecting all information with the chaining API
    inferenceRules: Array<InferOperatorWithSingleOperand<Specifics>>;
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
interface CreateBinaryOperatorDetails<Specifics extends TypirSpecifics> extends BinaryOperatorDetails { // only internally used for collecting all information with the chaining API
    inferenceRules: Array<InferOperatorWithMultipleOperands<Specifics>>;
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
interface CreateTernaryOperatorDetails<Specifics extends TypirSpecifics> extends TernaryOperatorDetails { // only internally used for collecting all information with the chaining API
    inferenceRules: Array<InferOperatorWithMultipleOperands<Specifics>>;
}

export interface GenericOperatorDetails extends AnyOperatorDetails {
    outputType: Type;
    inputParameter: NameTypePair[];
}
interface CreateGenericOperatorDetails<Specifics extends TypirSpecifics> extends GenericOperatorDetails { // only internally used for collecting all information with the chaining API
    inferenceRules: Array<InferOperatorWithSingleOperand<Specifics> | InferOperatorWithMultipleOperands<Specifics>>;
}

export interface OperatorFactoryService<Specifics extends TypirSpecifics> {
    createUnary(typeDetails: UnaryOperatorDetails): OperatorConfigurationUnaryChain<Specifics>;
    createBinary(typeDetails: BinaryOperatorDetails): OperatorConfigurationBinaryChain<Specifics>;
    createTernary(typeDetails: TernaryOperatorDetails): OperatorConfigurationTernaryChain<Specifics>;

    /** This function allows to create a single operator with arbitrary input operands. */
    createGeneric(typeDetails: GenericOperatorDetails): OperatorConfigurationGenericChain<Specifics>;
}

export interface OperatorConfigurationUnaryChain<Specifics extends TypirSpecifics> {
    inferenceRule<T extends Specifics['LanguageType']>(rule: InferOperatorWithSingleOperand<Specifics, T>): OperatorConfigurationUnaryChain<Specifics>;
    finish(): Array<TypeInitializer<Type, Specifics>>;
}
export interface OperatorConfigurationBinaryChain<Specifics extends TypirSpecifics> {
    inferenceRule<T extends Specifics['LanguageType']>(rule: InferOperatorWithMultipleOperands<Specifics, T>): OperatorConfigurationBinaryChain<Specifics>;
    finish(): Array<TypeInitializer<Type, Specifics>>;
}
export interface OperatorConfigurationTernaryChain<Specifics extends TypirSpecifics> {
    inferenceRule<T extends Specifics['LanguageType']>(rule: InferOperatorWithMultipleOperands<Specifics, T>): OperatorConfigurationTernaryChain<Specifics>;
    finish(): Array<TypeInitializer<Type, Specifics>>;
}
export interface OperatorConfigurationGenericChain<Specifics extends TypirSpecifics> {
    inferenceRule<T extends Specifics['LanguageType']>(rule: InferOperatorWithSingleOperand<Specifics, T> | InferOperatorWithMultipleOperands<Specifics, T>): OperatorConfigurationGenericChain<Specifics>;
    finish(): TypeInitializer<Type, Specifics>;
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
export class DefaultOperatorFactory<Specifics extends TypirSpecifics> implements OperatorFactoryService<Specifics> {
    protected readonly services: TypirServices<Specifics>;

    constructor(services: TypirServices<Specifics>) {
        this.services = services;
    }

    createUnary(typeDetails: UnaryOperatorDetails): OperatorConfigurationUnaryChain<Specifics> {
        return new OperatorConfigurationUnaryChainImpl(this.services, typeDetails);
    }

    createBinary(typeDetails: BinaryOperatorDetails): OperatorConfigurationBinaryChain<Specifics> {
        return new OperatorConfigurationBinaryChainImpl(this.services, typeDetails);
    }

    createTernary(typeDetails: TernaryOperatorDetails): OperatorConfigurationTernaryChain<Specifics> {
        return new OperatorConfigurationTernaryChainImpl(this.services, typeDetails);
    }

    createGeneric(typeDetails: GenericOperatorDetails): OperatorConfigurationGenericChain<Specifics> {
        return new OperatorConfigurationGenericChainImpl(this.services, typeDetails);
    }
}


class OperatorConfigurationUnaryChainImpl<Specifics extends TypirSpecifics> implements OperatorConfigurationUnaryChain<Specifics> {
    protected readonly services: TypirServices<Specifics>;
    protected readonly typeDetails: CreateUnaryOperatorDetails<Specifics>;

    constructor(services: TypirServices<Specifics>, typeDetails: UnaryOperatorDetails) {
        this.services = services;
        this.typeDetails = {
            ...typeDetails,
            inferenceRules: [],
        };
    }

    inferenceRule<T extends Specifics['LanguageType']>(rule: InferOperatorWithSingleOperand<Specifics, T>): OperatorConfigurationUnaryChain<Specifics> {
        this.typeDetails.inferenceRules.push(rule as unknown as InferOperatorWithSingleOperand<Specifics>);
        return this;
    }

    finish(): Array<TypeInitializer<Type, Specifics>> {
        const signatures = toSignatureArray(this.typeDetails);
        const result: Array<TypeInitializer<Type, Specifics>> = [];
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

class OperatorConfigurationBinaryChainImpl<Specifics extends TypirSpecifics> implements OperatorConfigurationBinaryChain<Specifics> {
    protected readonly services: TypirServices<Specifics>;
    protected readonly typeDetails: CreateBinaryOperatorDetails<Specifics>;

    constructor(services: TypirServices<Specifics>, typeDetails: BinaryOperatorDetails) {
        this.services = services;
        this.typeDetails = {
            ...typeDetails,
            inferenceRules: [],
        };
    }

    inferenceRule<T extends Specifics['LanguageType']>(rule: InferOperatorWithMultipleOperands<Specifics, T>): OperatorConfigurationBinaryChain<Specifics> {
        this.typeDetails.inferenceRules.push(rule as unknown as InferOperatorWithMultipleOperands<Specifics>);
        return this;
    }

    finish(): Array<TypeInitializer<Type, Specifics>> {
        const signatures = toSignatureArray(this.typeDetails);
        const result: Array<TypeInitializer<Type, Specifics>> = [];
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

class OperatorConfigurationTernaryChainImpl<Specifics extends TypirSpecifics> implements OperatorConfigurationTernaryChain<Specifics> {
    protected readonly services: TypirServices<Specifics>;
    protected readonly typeDetails: CreateTernaryOperatorDetails<Specifics>;

    constructor(services: TypirServices<Specifics>, typeDetails: TernaryOperatorDetails) {
        this.services = services;
        this.typeDetails = {
            ...typeDetails,
            inferenceRules: [],
        };
    }

    inferenceRule<T extends Specifics['LanguageType']>(rule: InferOperatorWithMultipleOperands<Specifics, T>): OperatorConfigurationTernaryChain<Specifics> {
        this.typeDetails.inferenceRules.push(rule as unknown as InferOperatorWithMultipleOperands<Specifics>);
        return this;
    }

    finish(): Array<TypeInitializer<Type, Specifics>> {
        const signatures = toSignatureArray(this.typeDetails);
        const result: Array<TypeInitializer<Type, Specifics>> = [];
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

class OperatorConfigurationGenericChainImpl<Specifics extends TypirSpecifics> implements OperatorConfigurationGenericChain<Specifics> {
    protected readonly services: TypirServices<Specifics>;
    protected readonly typeDetails: CreateGenericOperatorDetails<Specifics>;

    constructor(services: TypirServices<Specifics>, typeDetails: GenericOperatorDetails) {
        this.services = services;
        this.typeDetails = {
            ...typeDetails,
            inferenceRules: [],
        };
    }

    inferenceRule<T extends Specifics['LanguageType']>(rule: InferOperatorWithSingleOperand<Specifics, T> | InferOperatorWithMultipleOperands<Specifics, T>): OperatorConfigurationGenericChain<Specifics> {
        this.typeDetails.inferenceRules.push(rule as unknown as (InferOperatorWithSingleOperand<Specifics> | InferOperatorWithMultipleOperands<Specifics>));
        return this;
    }

    finish(): TypeInitializer<Type, Specifics> {
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
            newOperatorType.inferenceRuleForCalls<LanguageKeys<Specifics>, Specifics['LanguageType']>({
                languageKey: inferenceRule.languageKey,
                filter: inferenceRule.filter
                    ? ((languageNode: Specifics['LanguageType']): languageNode is Specifics['LanguageType'] => inferenceRule.filter!(languageNode, this.typeDetails.name))
                    : undefined,
                matching: (languageNode: Specifics['LanguageType']) => inferenceRule.matching(languageNode, this.typeDetails.name),
                inputArguments: (languageNode: Specifics['LanguageType']) => this.getInputArguments(inferenceRule, languageNode),
                validation: toArray(inferenceRule.validation).map(validationRule =>
                    (functionCall: Specifics['LanguageType'], functionType: FunctionType, accept: ValidationProblemAcceptor<Specifics>, typir: TypirServices<Specifics>) => validationRule(functionCall, operatorName, functionType, accept, typir)),
                validateArgumentsOfFunctionCalls: inferenceRule.validateArgumentsOfCalls,
            });
        }
        // operators have no declaration in the code => no inference rule for the operator declaration!

        return newOperatorType.finish() as unknown as TypeInitializer<Type, Specifics>;
    }

    protected getInputArguments(inferenceRule: InferOperatorWithSingleOperand<Specifics> | InferOperatorWithMultipleOperands<Specifics>, languageNode: Specifics['LanguageType']): Array<Specifics['LanguageType']> {
        return 'operands' in inferenceRule
            ? (inferenceRule as InferOperatorWithMultipleOperands<Specifics>).operands(languageNode, this.typeDetails.name)
            : [(inferenceRule as InferOperatorWithSingleOperand<Specifics>).operand(languageNode, this.typeDetails.name)];
    }

    protected getFunctionFactory(): FunctionFactoryService<Specifics> {
        return this.services.factory.Functions;
    }
}


function toSignatureArray<T>(values: {
    signature?: T;
    signatures?: T[];
}): T[] {
    const result = toArray(values.signatures, { newArray: true }); // create a new array in order to prevent side-effects in the given array
    if (values.signature) {
        result.push(values.signature);
    }
    if (result.length <= 0) {
        throw new Error('At least one signature must be given!');
    }
    return result;
}
