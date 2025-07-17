/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { beforeAll, describe, expect, test } from 'vitest';
import { PrimitiveType } from '../../../src/kinds/primitive/primitive-type.js';
import { BinaryExpression, booleanFalse, BooleanLiteral, booleanTrue, InferenceRuleBinaryExpression, integer123, integer456, IntegerLiteral, TestExpressionNode, TestLanguageNode } from '../../../src/test/predefined-language-nodes.js';
import { TypirServices } from '../../../src/typir.js';
import { createTypirServicesForTesting } from '../../../src/utils/test-utils.js';

describe('Tests the "validateArgumentsOfCalls" option to check the given arguments in (overloaded) operator calls', () => {
    let typir: TypirServices<TestLanguageNode>;
    let integerType: PrimitiveType;
    let booleanType: PrimitiveType;

    beforeAll(() => {
        typir = createTypirServicesForTesting();

        // primitive types
        integerType = typir.factory.Primitives.create({ primitiveName: 'integer' }).inferenceRule({ filter: node => node instanceof IntegerLiteral }).finish();
        booleanType = typir.factory.Primitives.create({ primitiveName: 'boolean' }).inferenceRule({ filter: node => node instanceof BooleanLiteral }).finish();

        // + operator: only integers, validate it
        typir.factory.Operators.createBinary({ name: '+' }).signature({ left: integerType, right: integerType, return: integerType })
            .inferenceRule({ ...InferenceRuleBinaryExpression, validateArgumentsOfCalls: true }).finish();

        // && operator: only booleans, don't validate it
        typir.factory.Operators.createBinary({ name: '&&' }).signature({ left: booleanType, right: booleanType, return: booleanType })
            .inferenceRule({ ...InferenceRuleBinaryExpression, validateArgumentsOfCalls: false }).finish();

        // == operator: is overloaded, validate the integer signature, don't validate the boolean signature
        typir.factory.Operators.createBinary({ name: '==' }).signature({ left: integerType, right: integerType, return: booleanType })
            .inferenceRule({ ...InferenceRuleBinaryExpression, validateArgumentsOfCalls: true }).finish();
        typir.factory.Operators.createBinary({ name: '==' }).signature({ left: booleanType, right: booleanType, return: booleanType })
            .inferenceRule({ ...InferenceRuleBinaryExpression, validateArgumentsOfCalls: false }).finish();
    });


    // +: only integers are supported
    test('123 + 456: OK', () => {
        expectOperatorCallValid(integer123, '+', integer456);
    });
    test('true + false: wrong, since this signature does not exist', () => {
        expectOperatorCallError(booleanTrue, '+', booleanFalse, "The type 'boolean' is not assignable to the type 'integer'.");
    });

    // &&: only booleans are supported
    test('123 && 456: not OK, but no errors are shown, since the validation is switched off for &&', () => {
        expectOperatorCallValid(integer123, '&&', integer456);
    });
    test('true && false: OK', () => {
        expectOperatorCallValid(booleanTrue, '&&', booleanFalse);
    });

    // ==: both signatures are supported, but only one is validated
    test('123 == 456: OK and validated', () => {
        expectOperatorCallValid(integer123, '==', integer456);
    });
    test('true == false: OK, since the signature exists', () => {
        expectOperatorCallValid(booleanTrue, '==', booleanFalse);
    });
    test('123 == false: wrong, since this signature is not defined', () => {
        expectOperatorCallError(integer123, '==', booleanFalse, 'is not assignable to the type');
    });
    test('true == 456: wrong, since this signature is not defined', () => {
        expectOperatorCallError(booleanTrue, '==', integer456, 'is not assignable to the type');
    });


    function expectOperatorCallValid(left: TestExpressionNode, operator: '=='|'+'|'&&', right: TestExpressionNode): void {
        const expr = new BinaryExpression(left, operator, right);
        const result = typir.validation.Collector.validate(expr);
        expect(result).toHaveLength(0);
    }
    function expectOperatorCallError(left: TestExpressionNode, operator: '=='|'+'|'&&', right: TestExpressionNode, includedProblem: string): void {
        const expr = new BinaryExpression(left, operator, right);
        const result = typir.validation.Collector.validate(expr);
        expect(result.length === 1).toBeTruthy();
        const msg = typir.Printer.printTypirProblem(result[0]);
        expect(msg, msg).includes(`'${operator}'`);
        expect(msg, msg).includes(includedProblem);
    }

});
