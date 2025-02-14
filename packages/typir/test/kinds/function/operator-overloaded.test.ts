/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

/* eslint-disable @typescript-eslint/parameter-properties */

import { beforeAll, describe, expect, test } from 'vitest';
import { assertTrue, ConversionEdge, isAssignabilityProblem, isAssignabilitySuccess, isPrimitiveType, PrimitiveType, SubTypeEdge, Type } from '../../../src/index.js';
import { InferenceRuleNotApplicable } from '../../../src/services/inference.js';
import { ValidationMessageDetails } from '../../../src/services/validation.js';
import { AssignmentStatement, BinaryExpression, booleanFalse, BooleanLiteral, booleanTrue, double2_0, double3_0, DoubleLiteral, InferenceRuleBinaryExpression, integer2, integer3, IntegerLiteral, string2, string3, StringLiteral, TestExpressionNode, Variable } from '../../../src/test/predefined-language-nodes.js';
import { TypirServices } from '../../../src/typir.js';
import { createTypirServicesForTesting, expectToBeType } from '../../../src/utils/test-utils.js';

describe('Multiple best matches for overloaded operators', () => {
    let typir: TypirServices;
    let integerType: PrimitiveType;
    let doubleType: PrimitiveType;
    let stringType: PrimitiveType;
    let booleanType: PrimitiveType;

    beforeAll(() => {
        typir = createTypirServicesForTesting();

        // primitive types
        integerType = typir.factory.Primitives.create({ primitiveName: 'integer' }).inferenceRule({ filter: node => node instanceof IntegerLiteral }).finish();
        doubleType = typir.factory.Primitives.create({ primitiveName: 'double' }).inferenceRule({ filter: node => node instanceof DoubleLiteral }).finish();
        stringType = typir.factory.Primitives.create({ primitiveName: 'string' }).inferenceRule({ filter: node => node instanceof StringLiteral }).finish();
        booleanType = typir.factory.Primitives.create({ primitiveName: 'boolean' }).inferenceRule({ filter: node => node instanceof BooleanLiteral }).finish();

        // operators
        typir.factory.Operators.createBinary({ name: '+', signatures: [ // operator overloading
            { left: integerType, right: integerType, return: integerType }, // 2 + 3 => 5
            { left: doubleType, right: doubleType, return: doubleType }, // 2.0 + 3.0 => 5.0
            { left: stringType, right: stringType, return: stringType }, // "2" + "3" => "23"
            { left: booleanType, right: booleanType, return: booleanType }, // TRUE + TRUE => FALSE
        ] }).inferenceRule(InferenceRuleBinaryExpression).finish();

        // define relationships between types
        typir.Conversion.markAsConvertible(booleanType, integerType, 'IMPLICIT_EXPLICIT'); // integerVariable := booleanValue;
        typir.Subtype.markAsSubType(integerType, doubleType); // double <|--- integer
        typir.Conversion.markAsConvertible(doubleType, stringType, 'IMPLICIT_EXPLICIT'); // stringVariable := doubleValue;

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


    describe('tests all cases for assignability and the checks the found assignability paths', () => {
        test('integer to integer', () => {
            expectAssignmentValid(integerType, integerType);
        });
        test('double to integer', () => {
            expectAssignmentError(doubleType, integerType);
        });
        test('string to integer', () => {
            expectAssignmentError(stringType, integerType);
        });
        test('boolean to integer', () => {
            expectAssignmentValid(booleanType, integerType, 'ConversionEdge');
        });

        test('integer to double', () => {
            expectAssignmentValid(integerType, doubleType, 'SubTypeEdge');
        });
        test('double to double', () => {
            expectAssignmentValid(doubleType, doubleType);
        });
        test('string to double', () => {
            expectAssignmentError(stringType, doubleType);
        });
        test('boolean to double', () => {
            expectAssignmentValid(booleanType, doubleType, 'ConversionEdge', 'SubTypeEdge');
        });

        test('integer to string', () => {
            expectAssignmentValid(integerType, stringType, 'SubTypeEdge', 'ConversionEdge');
        });
        test('double to string', () => {
            expectAssignmentValid(doubleType, stringType, 'ConversionEdge');
        });
        test('string to string', () => {
            expectAssignmentValid(stringType, stringType);
        });
        test('boolean to string', () => {
            expectAssignmentValid(booleanType, stringType, 'ConversionEdge', 'SubTypeEdge', 'ConversionEdge');
        });

        test('integer to boolean', () => {
            expectAssignmentError(integerType, booleanType);
        });
        test('double to boolean', () => {
            expectAssignmentError(doubleType, booleanType);
        });
        test('string to boolean', () => {
            expectAssignmentError(stringType, booleanType);
        });
        test('boolean to boolean', () => {
            expectAssignmentValid(booleanType, booleanType);
        });


        function expectAssignmentValid(sourceType: Type, targetType: Type, ...expectedPath: Array<SubTypeEdge['$relation']|ConversionEdge['$relation']>): void {
            // check the resulting assignability path
            const assignabilityResult = typir.Assignability.getAssignabilityResult(sourceType, targetType);
            assertTrue(isAssignabilitySuccess(assignabilityResult));
            const actualPath = assignabilityResult.path;
            const msg = `Actual assignability path is ${actualPath.map(e => e.$relation).join(' --> ')}.`;
            expect(actualPath.length, msg).toBe(expectedPath.length);
            for (let i = 0; i < actualPath.length; i++) {
                expect(actualPath[i].$relation, msg).toBe(expectedPath[i]);
                if (i >= 1) {
                    // the edges are connected with each other
                    expect(actualPath[i - 1].to).toBe(actualPath[i].from);
                }
            }
            // check beginning and end of the path
            if (actualPath.length >= 1) {
                expect(actualPath[0].from).toBe(sourceType);
                expect(actualPath[actualPath.length - 1].to).toBe(targetType);
            }
        }

        function expectAssignmentError(sourceType: Type, targetType: Type): void {
            const assignabilityResult = typir.Assignability.getAssignabilityResult(sourceType, targetType);
            assertTrue(isAssignabilityProblem(assignabilityResult));
        }
    });


    describe('Test multiple matches for overloaded operators and ensures that the best match is chosen', () => {
        test('2 + 3 => both are integers', () => {
            expectOverload(integer2, integer3, 'integer');
        });

        test('2.0 + 3.0 => both are doubles', () => {
            expectOverload(double2_0, double3_0, 'double');
        });

        test('"2" + "3" => both are strings', () => {
            expectOverload(string2, string3, 'string');
        });

        test('TRUE + FALSE => both are booleans', () => {
            expectOverload(booleanTrue, booleanFalse, 'boolean');
        });

        test('2 + TRUE => convert boolean to integer', () => {
            expectOverload(integer2, booleanTrue, 'integer');
        });

        test('2.0 + 3 => integers are doubles', () => {
            expectOverload(double2_0, integer3, 'double');
        });

        test('2.0 + "3" => convert double to string', () => {
            expectOverload(double2_0, string3, 'string');
        });

        test('2 + "3" => integer is sub-type of double, which is convertible to string', () => {
            expectOverload(integer2, string3, 'string');
        });


        function expectOverload(left: TestExpressionNode, right: TestExpressionNode, typeName: 'string'|'integer'|'double'|'boolean'): void {
            const example = new BinaryExpression(left, '+', right);
            const validationProblems = typir.validation.Collector.validate(example);
            expect(validationProblems, validationProblems.map(p => typir.Printer.printValidationProblem(p)).join('\n')).toHaveLength(0);
            const inferredType = typir.Inference.inferType(example);
            expectToBeType(inferredType, isPrimitiveType, type => type.getName() === typeName);
        }
    });

});

