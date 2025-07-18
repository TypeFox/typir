/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/
import { createTypirServices, InferenceRuleNotApplicable, InferOperatorWithMultipleOperands, InferOperatorWithSingleOperand, NO_PARAMETER_NAME } from 'typir';
import { BinaryExpression, isAssignment, isBinaryExpression, isCharString, isNumeric, isPrintout, isUnaryExpression, isVariableDeclaration, isVariableUsage, Node, UnaryExpression } from './expression-ast.js';

export function initializeTypir() {
    const typir = createTypirServices<Node>();
    const typeNumber = typir.factory.Primitives.create({
        primitiveName: 'number',
    }).inferenceRule({
        filter: isNumeric,
    }).finish();
    const typeString = typir.factory.Primitives.create({
        primitiveName: 'string',
    }).inferenceRule({
        filter: isCharString,
    }).finish();
    const typeVoid = typir.factory.Primitives.create({ primitiveName: 'void' }).finish();

    const binaryInferenceRule: InferOperatorWithMultipleOperands<Node, BinaryExpression> = {
        filter: isBinaryExpression,
        matching: (node: BinaryExpression, name: string) => node.op === name,
        operands: (node: BinaryExpression) => [node.left, node.right],
        validateArgumentsOfCalls: true,
    };
    for (const operator of ['+', '-', '/', '*', '%']) {
        typir.factory.Operators.createBinary({ name: operator, signature: { left: typeNumber, right: typeNumber, return: typeNumber } }).inferenceRule(binaryInferenceRule).finish();
    }
    typir.factory.Operators.createBinary({ name: '+', signature: { left: typeString, right: typeString, return: typeString } }).inferenceRule(binaryInferenceRule).finish();

    const unaryInferenceRule: InferOperatorWithSingleOperand<Node, UnaryExpression> = {
        filter: isUnaryExpression,
        matching: (node: UnaryExpression, name: string) => node.op === name,
        operand: (node: UnaryExpression, _name: string) => node.operand,
        validateArgumentsOfCalls: true,
    };
    typir.factory.Operators.createUnary({ name: '+', signature: { operand: typeNumber, return: typeNumber } }).inferenceRule(unaryInferenceRule).finish();
    typir.factory.Operators.createUnary({ name: '-', signature: { operand: typeNumber, return: typeNumber } }).inferenceRule(unaryInferenceRule).finish();

    typir.factory.Functions.create({
        functionName: 'print',
        inputParameters: [{
            name: 'input',
            type: typeString,
        }],
        outputParameter: { name: NO_PARAMETER_NAME, type: typeVoid },
    }).inferenceRuleForCalls({
        filter: isPrintout,
        matching: () => true,
        inputArguments: (node) => [node.value],
    }).finish();

    typir.Conversion.markAsConvertible(typeNumber, typeString, 'IMPLICIT_EXPLICIT');

    typir.Inference.addInferenceRule((languageNode) => {
        if (isVariableDeclaration(languageNode)) {
            return languageNode.value;
        } else if (isVariableUsage(languageNode)) {
            return languageNode.ref;
        }
        return InferenceRuleNotApplicable;
    });

    typir.validation.Collector.addValidationRule((node, accept) => {
        if (isAssignment(node)) {
            return typir.validation.Constraints.ensureNodeIsAssignable(node.value, node.variable, accept, (actual, expected) => ({
                languageNode: node, severity: 'error', message: `'${actual.name}' is not assignable to '${expected.name}'.`,
            }));
        }
    });

    return typir;
}
