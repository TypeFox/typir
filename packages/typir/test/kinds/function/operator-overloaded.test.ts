/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

/* eslint-disable @typescript-eslint/parameter-properties */

import { beforeAll, describe, expect, test } from 'vitest';
import { AssignmentStatement, BinaryExpression, BooleanLiteral, DoubleLiteral, InferenceRuleBinaryExpression, IntegerLiteral, StringLiteral, TestExpressionNode, Variable } from '../../../src/test/predefined-language-nodes.js';
import { createTypirServicesForTesting, expectToBeType } from '../../../src/utils/test-utils.js';
import { InferenceRuleNotApplicable} from '../../../src/services/inference.js';
import { ValidationMessageDetails } from '../../../src/services/validation.js';
import { TypirServices } from '../../../src/typir.js';
import { isPrimitiveType } from '../../../src/index.js';

describe('Multiple best matches for overloaded operators', () => {
    let typir: TypirServices;

    beforeAll(() => {
        typir = createTypirServicesForTesting();

        // primitive types
        const integerType = typir.factory.Primitives.create({ primitiveName: 'integer', inferenceRules: node => node instanceof IntegerLiteral });
        const doubleType = typir.factory.Primitives.create({ primitiveName: 'double', inferenceRules: node => node instanceof DoubleLiteral });
        const stringType = typir.factory.Primitives.create({ primitiveName: 'string', inferenceRules: node => node instanceof StringLiteral });
        const booleanType = typir.factory.Primitives.create({ primitiveName: 'boolean', inferenceRules: node => node instanceof BooleanLiteral });

        // operators
        typir.factory.Operators.createBinary({ name: '+', signatures: [ // operator overloading
            { left: integerType, right: integerType, return: integerType }, // 2 + 3 => 5
            { left: doubleType, right: doubleType, return: doubleType }, // 2.0 + 3.0 => 5.0
            { left: stringType, right: stringType, return: stringType }, // "2" + "3" => "23"
            { left: booleanType, right: booleanType, return: booleanType }, // TRUE + TRUE => FALSE
        ], inferenceRule: InferenceRuleBinaryExpression });

        // define relationships between types
        typir.Conversion.markAsConvertible(doubleType, stringType, 'IMPLICIT_EXPLICIT'); // stringVariable := doubleValue;
        typir.Conversion.markAsConvertible(booleanType, integerType, 'IMPLICIT_EXPLICIT'); // integerVariable := booleanValue;
        typir.Subtype.markAsSubType(integerType, doubleType); // double <|--- integer

        // specify, how Typir can detect the type of a variable
        typir.Inference.addInferenceRule(node => {
            if (node instanceof Variable) {
                return node.initialValue; // the type of the variable is the type of its initial value
            }
            return InferenceRuleNotApplicable;
        });

        // register a type-related validation
        typir.validation.Collector.addValidationRule(node => {
            if (node instanceof AssignmentStatement) {
                return typir.validation.Constraints.ensureNodeIsAssignable(node.right, node.left, (actual, expected) => <ValidationMessageDetails>{ message:
                    `The type '${actual.name}' is not assignable to the type '${expected.name}'.` });
            }
            return [];
        });
    });


    describe('tests all cases for assignability', () => {
        test('integer to integer', () => {
            expectAssignmentValid(new IntegerLiteral(123), new IntegerLiteral(456));
        });
        test('double to integer', () => {
            expectAssignmentError(new DoubleLiteral(123.0), new IntegerLiteral(456));
        });
        test('string to integer', () => {
            expectAssignmentError(new StringLiteral('123'), new IntegerLiteral(456));
        });
        test('boolean to integer', () => {
            expectAssignmentValid(new BooleanLiteral(true), new IntegerLiteral(456));
        });

        test('integer to double', () => {
            expectAssignmentValid(new IntegerLiteral(123), new DoubleLiteral(456.0));
        });
        test('double to double', () => {
            expectAssignmentValid(new DoubleLiteral(123.0), new DoubleLiteral(456.0));
        });
        test('string to double', () => {
            expectAssignmentError(new StringLiteral('123'), new DoubleLiteral(456.0));
        });
        test('boolean to double', () => {
            expectAssignmentValid(new BooleanLiteral(true), new DoubleLiteral(456.0));
        });

        test('integer to string', () => {
            expectAssignmentValid(new IntegerLiteral(123), new StringLiteral('456'));
        });
        test('double to string', () => {
            expectAssignmentValid(new DoubleLiteral(123.0), new StringLiteral('456'));
        });
        test('string to string', () => {
            expectAssignmentValid(new StringLiteral('123'), new StringLiteral('456'));
        });
        test('boolean to string', () => {
            expectAssignmentValid(new BooleanLiteral(true), new StringLiteral('456'));
        });

        test('integer to boolean', () => {
            expectAssignmentError(new IntegerLiteral(123), new BooleanLiteral(false));
        });
        test('double to boolean', () => {
            expectAssignmentError(new DoubleLiteral(123.0), new BooleanLiteral(false));
        });
        test('string to boolean', () => {
            expectAssignmentError(new StringLiteral('123'), new BooleanLiteral(false));
        });
        test('boolean to boolean', () => {
            expectAssignmentValid(new BooleanLiteral(true), new BooleanLiteral(false));
        });


        function expectAssignmentValid(value: TestExpressionNode, variableInitType: TestExpressionNode): void {
            const variable = new Variable('v1', variableInitType);
            const assignment = new AssignmentStatement(variable, value);
            expect(typir.validation.Collector.validate(assignment)).toHaveLength(0);
        }

        function expectAssignmentError(value: TestExpressionNode, variableInitType: TestExpressionNode): void {
            const variable = new Variable('v1', variableInitType);
            const assignment = new AssignmentStatement(variable, value);
            const errors = typir.validation.Collector.validate(assignment);
            expect(errors).toHaveLength(1);
            expect(errors[0].message).includes('is not assignable to');
        }
    });


    describe('Test multiple matches for overloaded operators', () => {
        test('2 + 3 => both are integers', () => {
            expectOverload(new IntegerLiteral(2), new IntegerLiteral(3), 'integer');
        });

        test('2.0 + 3.0 => both are doubles', () => {
            expectOverload(new DoubleLiteral(2.0), new DoubleLiteral(3.0), 'double');
        });

        test('"2" + "3" => both are strings', () => {
            expectOverload(new StringLiteral('2'), new StringLiteral('3'), 'string');
        });

        test('TRUE + FALSE => both are booleans', () => {
            expectOverload(new BooleanLiteral(true), new BooleanLiteral(false), 'boolean');
        });

        test('2 + TRUE => convert boolean to integer', () => {
            expectOverload(new IntegerLiteral(2), new BooleanLiteral(true), 'integer');
        });

        test('2.0 + 3 => integers are doubles', () => {
            expectOverload(new DoubleLiteral(2.0), new IntegerLiteral(3), 'double');
        });

        test('2.0 + "3" => convert double to string', () => {
            expectOverload(new DoubleLiteral(2.0), new StringLiteral('3'), 'string');
        });

        test('2 + "3" => integer is sub-type of double, which is convertible to string', () => {
            expectOverload(new IntegerLiteral(2), new StringLiteral('3'), 'string');
        });


        function expectOverload(left: TestExpressionNode, right: TestExpressionNode, typeName: 'string'|'integer'|'double'|'boolean'): void {
            const example = new BinaryExpression(left, '+', right);
            expect(typir.validation.Collector.validate(example)).toHaveLength(0);
            const inferredType = typir.Inference.inferType(example);
            expectToBeType(inferredType, isPrimitiveType, type => type.getName() === typeName);
        }
    });

});

