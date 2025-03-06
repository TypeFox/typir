/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

/* eslint-disable @typescript-eslint/parameter-properties */

import { describe, expect, test } from 'vitest';
import { InferenceRuleNotApplicable } from '../src/services/inference.js';
import { InferOperatorWithMultipleOperands } from '../src/services/operator.js';
import { createTypirServices } from '../src/typir.js';

describe('Tiny Typir', () => {

    test('Set-up and test some expressions', async () => {
        const typir = createTypirServices<AstElement>(); // set-up the type system, <AstElement> specifies the root type of all language nodes

        // primitive types
        const numberType = typir.factory.Primitives.create({ primitiveName: 'number' }).inferenceRule({ filter: node => node instanceof NumberLiteral }).finish();
        const stringType = typir.factory.Primitives.create({ primitiveName: 'string' }).inferenceRule({ filter: node => node instanceof StringLiteral }).finish();

        // operators
        const inferenceRule: InferOperatorWithMultipleOperands<AstElement, BinaryExpression> = {
            filter: node => node instanceof BinaryExpression,
            matching: (node, operatorName) => node.operator === operatorName,
            operands: node => [node.left, node.right],
            validateArgumentsOfCalls: true, // explicitly request to check, that the types of the arguments in operator calls fit to the parameters
        };
        typir.factory.Operators.createBinary({ name: '+', signatures: [ // operator overloading
            { left: numberType, right: numberType, return: numberType }, // 2 + 3
            { left: stringType, right: stringType, return: stringType }, // "2" + "3"
        ] }).inferenceRule(inferenceRule).finish();
        typir.factory.Operators.createBinary({ name: '-', signatures: [{ left: numberType, right: numberType, return: numberType }] }).inferenceRule(inferenceRule).finish(); // 2 - 3

        // numbers are implicitly convertable to strings
        typir.Conversion.markAsConvertible(numberType, stringType, 'IMPLICIT_EXPLICIT');

        // specify, how Typir can detect the type of a variable
        typir.Inference.addInferenceRule(node => {
            if (node instanceof Variable) {
                return node.initialValue; // the type of the variable is the type of its initial value
            }
            return InferenceRuleNotApplicable;
        });

        // register a type-related validation
        typir.validation.Collector.addValidationRule((node, accept) => {
            if (node instanceof AssignmentStatement) {
                typir.validation.Constraints.ensureNodeIsAssignable(node.right, node.left, accept, (actual, expected) => ({ message:
                    `The type '${actual.name}' is not assignable to the type '${expected.name}'.` }));
            }
        });

        // 2 + 3 => OK
        const example1 = new BinaryExpression(new NumberLiteral(2), '+', new NumberLiteral(3));
        expect(typir.validation.Collector.validate(example1)).toHaveLength(0);

        // 2 + "3" => OK
        const example2 = new BinaryExpression(new NumberLiteral(2), '+', new StringLiteral('3'));
        expect(typir.validation.Collector.validate(example2)).toHaveLength(0);

        // 2 - "3" => wrong
        const example3 = new BinaryExpression(new NumberLiteral(2), '-', new StringLiteral('3'));
        const errors1 = typir.validation.Collector.validate(example3);
        const errorStack = typir.Printer.printTypirProblem(errors1[0]); // the problem comes with "sub-problems" to describe the reasons in more detail
        expect(errorStack).includes("The parameter 'right' at index 1 got a value with a wrong type.");
        expect(errorStack).includes("For property 'right', the types 'string' and 'number' do not match.");

        // 123 is assignable to a string variable
        const varString = new Variable('v1', new StringLiteral('Hello'));
        const assignNumberToString = new AssignmentStatement(varString, new NumberLiteral(123));
        expect(typir.validation.Collector.validate(assignNumberToString)).toHaveLength(0);

        // "123" is not assignable to a number variable
        const varNumber = new Variable('v2', new NumberLiteral(456));
        const assignStringToNumber = new AssignmentStatement(varNumber, new StringLiteral('123'));
        const errors2 = typir.validation.Collector.validate(assignStringToNumber);
        expect(errors2[0].message).toBe("The type 'string' is not assignable to the type 'number'.");
    });

});

abstract class AstElement {
    // empty
}

class NumberLiteral extends AstElement {
    constructor(
        public value: number,
    ) { super(); }
}
class StringLiteral extends AstElement {
    constructor(
        public value: string,
    ) { super(); }
}

class BinaryExpression extends AstElement {
    constructor(
        public left: AstElement,
        public operator: string,
        public right: AstElement,
    ) { super(); }
}

class Variable extends AstElement {
    constructor(
        public name: string,
        public initialValue: AstElement,
    ) { super(); }
}

class AssignmentStatement extends AstElement {
    constructor(
        public left: Variable,
        public right: AstElement,
    ) { super(); }
}
