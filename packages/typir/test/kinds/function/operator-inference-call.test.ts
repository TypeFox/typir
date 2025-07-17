/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { beforeAll, describe, expect, test } from 'vitest';
import { isType } from '../../../src/graph/type-node.js';
import { isPrimitiveType, PrimitiveType } from '../../../src/kinds/primitive/primitive-type.js';
import { BinaryExpression, InferenceRuleBinaryExpression, integer123, integer456, IntegerLiteral, string123, string456, StringLiteral, TestExpressionNode, TestLanguageNode } from '../../../src/test/predefined-language-nodes.js';
import { TypirServices } from '../../../src/typir.js';
import { createTypirServicesForTesting, expectToBeType, expectValidationIssuesStrict } from '../../../src/utils/test-utils.js';

describe('Tests some special cases for (overloaded) operator calls', () => {

    describe('Overloaded operators, one signature has no arguments at all (this is tests explicitly cover a found bug)', () => {
        let typir: TypirServices<TestLanguageNode>;
        let integerType: PrimitiveType;
        let stringType: PrimitiveType;

        beforeAll(() => {
            typir = createTypirServicesForTesting();

            // primitive types
            integerType = typir.factory.Primitives.create({ primitiveName: 'integer' }).inferenceRule({ filter: node => node instanceof IntegerLiteral }).finish();
            stringType = typir.factory.Primitives.create({ primitiveName: 'string' }).inferenceRule({ filter: node => node instanceof StringLiteral }).finish();

            // + operator: is overloaded
            // integers, without arguments
            typir.factory.Operators.createBinary({ name: '+' })
                .signature({ left: integerType, right: integerType, return: integerType })
                .inferenceRule({ ...InferenceRuleBinaryExpression, operands: () => []})
                // .inferenceRule(inferenceRule)
                .finish();
            // strings, with arguments
            typir.factory.Operators.createBinary({ name: '+' })
                .signature({ left: stringType, right: stringType, return: stringType })
                .inferenceRule(InferenceRuleBinaryExpression)
                .finish();
        });


        test('+ with Strings', () => {
            expectInferredType(typir, string123, '+', string456, 'string');
        });

        test('+ with Integers', () => {
            // fails, since the signature expects two arguments, but the inference rule provides no arguments
            expectInferenceProblem(typir, integer123, '+', integer456);
        });
    });

    test('Overloaded operator has two inference rules', () => {
        const typir = createTypirServicesForTesting();

        // primitive types
        const integerType = typir.factory.Primitives.create({ primitiveName: 'integer' }).inferenceRule({ filter: node => node instanceof IntegerLiteral }).finish();
        const stringType = typir.factory.Primitives.create({ primitiveName: 'string' }).inferenceRule({ filter: node => node instanceof StringLiteral }).finish();

        // + operator: is overloaded
        // integers, without arguments
        typir.factory.Operators.createBinary({ name: '+' })
            .signature({ left: integerType, right: integerType, return: integerType })
            .inferenceRule({ ...InferenceRuleBinaryExpression, operands: () => []})
            .inferenceRule(InferenceRuleBinaryExpression) // this has a second inference rule
            .finish();
        // strings, with arguments
        typir.factory.Operators.createBinary({ name: '+' })
            .signature({ left: stringType, right: stringType, return: stringType })
            .inferenceRule(InferenceRuleBinaryExpression)
            .finish();

        // with the second inference rule, it works now as usual!
        expectInferredType(typir, integer123, '+', integer456, 'integer');
    });

    test('Overloaded operator has a validation for the inference rule of one signature', () => {
        const typir = createTypirServicesForTesting();

        // primitive types
        const integerType = typir.factory.Primitives.create({ primitiveName: 'integer' }).inferenceRule({ filter: node => node instanceof IntegerLiteral }).finish();
        const stringType = typir.factory.Primitives.create({ primitiveName: 'string' }).inferenceRule({ filter: node => node instanceof StringLiteral }).finish();

        // + operator: is overloaded
        // integers, with validation
        typir.factory.Operators.createBinary({ name: '+' })
            .signature({ left: integerType, right: integerType, return: integerType })
            .inferenceRule({
                ...InferenceRuleBinaryExpression,
                validation: (node, name, opType, accept) => accept({ languageNode: node, severity: 'error', message: `Called '${name}' with '${opType.getOutput()!.type.getName()}'.` }),
            })
            .finish();
        // strings, without validation
        typir.factory.Operators.createBinary({ name: '+' })
            .signature({ left: stringType, right: stringType, return: stringType })
            .inferenceRule(InferenceRuleBinaryExpression)
            .finish();

        // validation issues only for one of the two signatures!
        expectValidationIssuesStrict(typir, new BinaryExpression(integer123, '+', integer456), ["Called '+' with 'integer'."]);
        expectValidationIssuesStrict(typir, new BinaryExpression(string123, '+', string456), []);
    });

});

function expectInferredType(typir: TypirServices<TestLanguageNode>, left: TestExpressionNode, operator: '+', right: TestExpressionNode, expectedType: 'integer'|'string'): void {
    const expr = new BinaryExpression(left, operator, right);
    const result = typir.Inference.inferType(expr);
    if (isType(result)) {
        expectToBeType(result, isPrimitiveType, result => result.getName() === expectedType);
    } else {
        expect.fail(result.map(p => typir.Printer.printTypirProblem(p)).join('\n'));
    }
}

function expectInferenceProblem(typir: TypirServices<TestLanguageNode>, left: TestExpressionNode, operator: '+', right: TestExpressionNode): void {
    const expr = new BinaryExpression(left, operator, right);
    const result = typir.Inference.inferType(expr);
    if (isType(result)) {
        expect.fail(typir.Printer.printTypeName(result));
    } else {
        // this is the wanted result
    }
}
