/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { beforeEach, describe, expect, test } from 'vitest';
import { CustomKind } from '../../../src/kinds/custom/custom-kind.js';
import { CustomType, isCustomType } from '../../../src/kinds/custom/custom-type.js';
import { isPrimitiveType, PrimitiveType } from '../../../src/kinds/primitive/primitive-type.js';
import { DefaultTypeInferenceCollector, InferenceRuleNotApplicable, TypeInferenceRule } from '../../../src/services/inference.js';
import { ValidationProblemAcceptor } from '../../../src/services/validation.js';
import { createTypirServicesForTesting, createTypirServicesForTestingWithAdditionalServices, IntegerLiteral, TestExpressionNode, TestingSpecifics } from '../../../src/test/predefined-language-nodes.js';
import { TypirServices } from '../../../src/typir.js';
import { RuleRegistry } from '../../../src/utils/rule-registration.js';
import { expectToBeType, expectTypirTypes, expectValidationIssuesNone, expectValidationIssuesStrict } from '../../../src/test/test-utils.js';
import { assertTypirType } from '../../../src/utils/utils.js';

/**
 * The custom type called "Matrix" represents a two-dimensional array of primitive types.
 * Known from mathematics, the "width" represents the number of columns and the "height" the number of row of a matrix.
 *
 * This TypeScript type specifies the properties of the Typir types which represent "matrices".
 */
export type MatrixType = { // "interface" instead of "type" does not work!
    baseType: PrimitiveType;
    width: number;
    height: number;
};

describe('Tests simple custom types for Matrix types', () => {

    test('Matrix type with exposed factory', () => {
        type AdditionalMatrixTypirServices = {
            readonly factory: {
                readonly Matrix: CustomKind<MatrixType, TestingSpecifics>;
            },
        };
        const typir = createTypirServicesForTestingWithAdditionalServices<AdditionalMatrixTypirServices>({
            factory: {
                // create a custom kind to create custom types with dedicated properties (as defined in <MatrixType>) and provide it as additional Typir service
                Matrix: services => new CustomKind<MatrixType, TestingSpecifics>(services, {
                    name: 'Matrix',
                    // determine which identifier is used to store and retrieve a custom type in the type graph
                    calculateTypeName: properties => `My${properties.width}x${properties.height}Matrix`,
                    // (and to check its uniqueness, i.e. if two types have the same identifier, they are the same and only one of it will be added to the type graph)
                    calculateTypeIdentifier: properties =>
                        `custom-matrix-${services.infrastructure.TypeResolver.resolve(properties.baseType).getIdentifier()}-${properties.width}-${properties.height}`,
                }),
            },
        });
        const integerType = typir.factory.Primitives.create({ primitiveName: 'Integer' }).finish();

        // now use this custom factory to create some custom types
        const matrix2x2 = typir.factory.Matrix // "lazy" to use matrix2x2 as 'baseType' => review ZOD, separate primitives and Typir-Types
            .create({ typeName: 'My2x2MatrixType', properties: { baseType: integerType, width: 2, height: 2 } })
            .finish().getTypeFinal()!; // we know, that the new custom type depends only on types which are already available
        expect(typir.Printer.printTypeUserRepresentation(matrix2x2)).toBe('My2x2MatrixType');
        assertTypirType(matrix2x2, type => isCustomType(type, typir.factory.Matrix), 'My2x2MatrixType');
        expectTypirTypes(typir, type => isCustomType(type, typir.factory.Matrix), 'My2x2MatrixType');
        expect(matrix2x2.properties.width).toBe(2);
        expect(matrix2x2.properties.height).toBe(2);
        expectToBeType(matrix2x2.properties.baseType.getType(), isPrimitiveType, type => type === integerType);

        const matrix3x3 = typir.factory.Matrix
            .create({ typeName: 'My3x3MatrixType', properties: { baseType: integerType, width: 3, height: 3 } })
            .finish().getTypeFinal()!; // we know, that the new custom type depends only on types which are already available
        expect(typir.Printer.printTypeUserRepresentation(matrix3x3)).toBe('My3x3MatrixType');
        assertTypirType(matrix3x3, type => isCustomType(type, typir.factory.Matrix), 'My3x3MatrixType');
        expectTypirTypes(typir, type => isCustomType(type, typir.factory.Matrix), 'My2x2MatrixType', 'My3x3MatrixType');
        expect(matrix3x3.properties.width).toBe(3);
        expect(matrix3x3.properties.height).toBe(3);
        expectToBeType(matrix3x3.properties.baseType.getType(), isPrimitiveType, type => type === integerType);
    });

    test('Matrix type with very simple inference rules', () => {
        const typir = createTypirServicesForTesting();
        const integerType = typir.factory.Primitives.create({ primitiveName: 'Integer' }).finish();
        const customKind = new CustomKind<MatrixType, TestingSpecifics>(typir, {
            name: 'Matrix',
            calculateTypeIdentifier: properties =>
                `custom-matrix-${typir.infrastructure.TypeResolver.resolve(properties.baseType).getIdentifier()}-${properties.width}-${properties.height}`,
        });

        const matrix2x2 = customKind
            .create({ typeName: 'My2x2MatrixType', properties: { baseType: integerType, width: 2, height: 2 } })
            .inferenceRule({ matching: node => node === matrixLiteral2x2 }) // very limited inference rule, only for testing
            .finish().getTypeFinal()!;
        const matrix3x3 = customKind
            .create({ typeName: 'My3x3MatrixType', properties: { baseType: integerType, width: 3, height: 3 } })
            .inferenceRule({ matching: node => node === matrixLiteral3x3 }) // very limited inference rule, only for testing
            .finish().getTypeFinal()!;

        expectToBeType(typir.Inference.inferType(matrixLiteral3x3), result => isCustomType(result, customKind), result => result === matrix3x3);
        expectToBeType(typir.Inference.inferType(matrixLiteral2x2), result => isCustomType(result, customKind), result => result === matrix2x2);

        expect(typir.Inference.inferType(matrixLiteral1x1)).toHaveLength(1); // no type, but a problem, since there is no 1x1 matrix type!
    });

    test('Matrix type with very simple inference rules (+ validation rule)', () => {
        const typir = createTypirServicesForTesting();
        const integerType = typir.factory.Primitives.create({ primitiveName: 'Integer' }).finish();
        const customKind = new CustomKind<MatrixType, TestingSpecifics>(typir, {
            name: 'Matrix',
            calculateTypeIdentifier: properties =>
                `custom-matrix-${typir.infrastructure.TypeResolver.resolve(properties.baseType).getIdentifier()}-${properties.width}-${properties.height}`,
        });

        function checkCompleteness(node: MatrixLiteral, matrixType: CustomType<MatrixType, TestingSpecifics>, accept: ValidationProblemAcceptor<TestingSpecifics>): void {
            const height = matrixType.properties.height;
            if (node.elements.some(column => column.length !== height)) {
                accept({ languageNode: node, severity: 'error', message: 'Incomplete content in matrix literal found' });
            }
        }

        const matrix2x2 = customKind
            .create({ typeName: 'My2x2MatrixType', properties: { baseType: integerType, width: 2, height: 2 } })
            .inferenceRule({
                matching: node => node === matrixLiteral2x2 || node === matrixLiteral2x2Incomplete,
                validation: checkCompleteness }) // very limited inference rule, only for testing
            .finish().getTypeFinal()!;
        const matrix3x3 = customKind
            .create({ typeName: 'My3x3MatrixType', properties: { baseType: integerType, width: 3, height: 3 } })
            .inferenceRule({
                matching: node => node === matrixLiteral3x3 || node === matrixLiteral3x3Incomplete,
                validation: checkCompleteness }) // very limited inference rule, only for testing
            .finish().getTypeFinal()!;

        expectToBeType(typir.Inference.inferType(matrixLiteral2x2), result => isCustomType(result, customKind), result => result === matrix2x2);
        expectToBeType(typir.Inference.inferType(matrixLiteral2x2Incomplete), result => isCustomType(result, customKind), result => result === matrix2x2);
        expectToBeType(typir.Inference.inferType(matrixLiteral3x3), result => isCustomType(result, customKind), result => result === matrix3x3);
        expectToBeType(typir.Inference.inferType(matrixLiteral3x3Incomplete), result => isCustomType(result, customKind), result => result === matrix3x3);

        expectValidationIssuesNone(typir, matrixLiteral2x2);
        expectValidationIssuesStrict(typir, matrixLiteral2x2Incomplete, ['Incomplete content in matrix literal found']);
        expectValidationIssuesNone(typir, matrixLiteral3x3);
        expectValidationIssuesStrict(typir, matrixLiteral3x3Incomplete, ['Incomplete content in matrix literal found']);
    });

    test('Matrix type with generic inference rule: only get', () => {
        const typir = createTypirServicesForTesting();
        const integerType = typir.factory.Primitives.create({ primitiveName: 'Integer' }).finish();
        const customKind = new CustomKind<MatrixType, TestingSpecifics>(typir, {
            name: 'Matrix',
            calculateTypeIdentifier: properties =>
                `custom-matrix-${typir.infrastructure.TypeResolver.resolve(properties.baseType).getIdentifier()}-${properties.width}-${properties.height}`,
        });

        const matrix2x2 = customKind
            .create({ typeName: 'My2x2MatrixType', properties: { baseType: integerType, width: 2, height: 2 } })
            // no inference rule here
            .finish().getTypeFinal()!;
        const matrix3x3 = customKind
            .create({ typeName: 'My3x3MatrixType', properties: { baseType: integerType, width: 3, height: 3 } })
            // no inference rule here
            .finish().getTypeFinal()!;

        // ... but a single, generic inference rule here
        typir.Inference.addInferenceRule(node => {
            if (node instanceof MatrixLiteral) {
                const width = node.elements.map(row => row.length).reduce((l, r) => Math.max(l, r), 0); // the number of cells in the longest row
                const height = node.elements.length; // the number of rows
                const type = customKind.get({ baseType: integerType, width, height });
                return type.getType() || InferenceRuleNotApplicable;
            }
            return InferenceRuleNotApplicable;
        });

        expectToBeType(typir.Inference.inferType(matrixLiteral3x3), result => isCustomType(result, customKind), result => result === matrix3x3);
        expectToBeType(typir.Inference.inferType(matrixLiteral2x2), result => isCustomType(result, customKind), result => result === matrix2x2);

        expect(typir.Inference.inferType(matrixLiteral1x1)).toHaveLength(1); // no type, but a problem, since there is no 1x1 matrix type!

        const matrix1x1 = customKind
            .create({ typeName: 'My1x1MatrixType', properties: { baseType: integerType, width: 1, height: 1 } })
            .finish().getTypeFinal()!;
        // now the 1x1 matrix type exists and can be inferred!
        expectToBeType(typir.Inference.inferType(matrixLiteral1x1), result => isCustomType(result, customKind), result => result === matrix1x1);
    });

    test('Matrix type with generic inference rule: get or create', () => {
        const typir = createTypirServicesForTesting();
        const integerType = typir.factory.Primitives.create({ primitiveName: 'Integer' }).finish();
        const customKind = new CustomKind<MatrixType, TestingSpecifics>(typir, {
            name: 'Matrix',
            calculateTypeIdentifier: properties =>
                `custom-matrix-${typir.infrastructure.TypeResolver.resolve(properties.baseType).getIdentifier()}-${properties.width}-${properties.height}`,
        });
        // a single, generic inference rule
        typir.Inference.addInferenceRule(node => {
            if (node instanceof MatrixLiteral) {
                const width = node.elements.map(row => row.length).reduce((l, r) => Math.max(l, r), 0); // the number of cells in the longest row
                const height = node.elements.length; // the number of rows
                return customKind.create({ typeName: `My${width}x${height}MatrixType`, properties: { baseType: integerType, width, height }})
                    .finish().getTypeFinal()!; // we know, that the type can be created now, without delay
            }
            return InferenceRuleNotApplicable;
        });

        // we create some Matrix types in advance
        const matrix2x2 = customKind
            .create({ typeName: 'My2x2MatrixType', properties: { baseType: integerType, width: 2, height: 2 } })
            .finish().getTypeFinal()!;
        const matrix3x3 = customKind
            .create({ typeName: 'My3x3MatrixType', properties: { baseType: integerType, width: 3, height: 3 } })
            .finish().getTypeFinal()!;

        // the already created Matrix types are inferred
        expectToBeType(typir.Inference.inferType(matrixLiteral3x3), result => isCustomType(result, customKind), result => result === matrix3x3);
        expectToBeType(typir.Inference.inferType(matrixLiteral2x2), result => isCustomType(result, customKind), result => result === matrix2x2);
        expectTypirTypes(typir, type => isCustomType(type, customKind), 'My2x2MatrixType', 'My3x3MatrixType'); // we have only 2 Matrix types in the type graph

        // a new Matrix type is created and inferred for the 1x1 matrix literal:
        expectToBeType(typir.Inference.inferType(matrixLiteral1x1), result => isCustomType(result, customKind),
            result => result.properties.height === 1 && result.properties.width === 1 && result.properties.baseType.getType() === integerType);
        expectTypirTypes(typir, type => isCustomType(type, customKind), 'My2x2MatrixType', 'My3x3MatrixType', 'My1x1MatrixType'); // now we have 3 Matrix types

        // we try to explicitly create the 1x1 Matrix type ...
        const matrix1x1 = customKind
            .create({ typeName: 'My1x1MatrixType', properties: { baseType: integerType, width: 1, height: 1 } })
            .finish().getTypeFinal()!; // ... the already existing 1x1 Matrix type is returned: 'create' behaves like 'getOrCreate', since no duplicated types should be created
        expectToBeType(typir.Inference.inferType(matrixLiteral1x1), result => isCustomType(result, customKind), result => result === matrix1x1);
        // but we receive an error, if we specified a different 'typeName'
        expect(() => customKind
            .create({ typeName: 'AnotherName', properties: { baseType: integerType, width: 1, height: 1 } })
            .finish().getTypeFinal()).toThrowError("There is already a custom type 'custom-matrix-Integer-1-1' with name 'My1x1MatrixType', but now the name is 'AnotherName'!");
    });

    describe('Matrix type with type-specific inference rules', () => {
        let typir: TypirServices<TestingSpecifics>;
        let integerType: PrimitiveType;
        let customKind: CustomKind<MatrixType, TestingSpecifics>;

        // customize Typir in order to count the number of registered inference rules
        class TestInferenceImpl extends DefaultTypeInferenceCollector<TestingSpecifics> {
            override readonly ruleRegistry: RuleRegistry<TypeInferenceRule<TestingSpecifics>, TestingSpecifics>;
        }

        beforeEach(() => {
            typir = createTypirServicesForTesting({
                Inference: (services) => new TestInferenceImpl(services),
            });

            integerType = typir.factory.Primitives.create({ primitiveName: 'Integer' }).finish();

            customKind = new CustomKind<MatrixType, TestingSpecifics>(typir, {
                name: 'Matrix',
                calculateTypeIdentifier: properties =>
                    `custom-matrix-${typir.infrastructure.TypeResolver.resolve(properties.baseType).getIdentifier()}-${properties.width}-${properties.height}`,
                calculateTypeName: properties =>
                    `${properties.width}x${properties.height}-Matrix`,
            });
        });

        function countInferenceRules(): number {
            return (typir.Inference as TestInferenceImpl).ruleRegistry.getNumberUniqueRules();
        }

        function getOrCreateMatrixType(width: number, height: number, skipThisRuleIfThisTypeAlreadyExists: boolean): CustomType<MatrixType, TestingSpecifics> {
            return customKind
                .create({ properties: { baseType: integerType, width, height } })
                // each matrix type has its own custom inference rule
                .inferenceRule({
                    filter: node => node instanceof MatrixLiteral,
                    matching: (node, type) => node.elements.length === type.properties.width && node.elements.map(row => row.length).reduce((l, r) => Math.max(l, r), 0) === type.properties.height,
                    skipThisRuleIfThisTypeAlreadyExists, // control how to deal with this inference rule for an already existing custom type
                })
                .finish()
                .getTypeFinal()!;
        }

        test('Additional inference rules for already existing types', () => {
            const initialInferenceRuleSize = countInferenceRules();
            // create a new Matrix type
            const matrix2x2 = getOrCreateMatrixType(2, 2, false);
            expect(countInferenceRules()).toBe(initialInferenceRuleSize + 1); // new Matrix type with its own inference rule
            // "create it again" => in the end, the existing Matrix type is reused
            const matrix2x2Another = getOrCreateMatrixType(2, 2, false);
            // both types are the same (since they have the same identifier, since it contains the same values for the primitive type, width and height), ...
            expect(matrix2x2).toBe(matrix2x2Another);
            // ... but we have another inference rule now, since the rules for the new type are moved to the existing type!
            expect(countInferenceRules()).toBe(initialInferenceRuleSize + 2);
        });

        test('Dont create inference rules for already existing types', () => {
            const initialInferenceRuleSize = countInferenceRules();
            // create a new Matrix type
            const matrix2x2 = getOrCreateMatrixType(2, 2, true);
            expect(countInferenceRules()).toBe(initialInferenceRuleSize + 1); // new Matrix type with its own inference rule
            // "create it again" => in the end, the existing Matrix type is reused
            const matrix2x2Another = getOrCreateMatrixType(2, 2, true);
            // both types are the same, ...
            expect(matrix2x2).toBe(matrix2x2Another);
            // ... but there is no additional inference rule!
            expect(countInferenceRules()).toBe(initialInferenceRuleSize + 1);
        });

    });

});


/**
 * Instances of this class represent literals for matrices in the AST, i.e. AST nodes. An example might be visualized like this:
 * [ 1, 2, 3;
 *   4, 5, 6 ]
 * They are similar to array literals in usual programming languages.
 *
 * To keep the example more clear, this new literal is not registered in the TestLanguageService (see custom-example-restricted.test.ts for a corresponding example).
 */
class MatrixLiteral extends TestExpressionNode {
    constructor(
        public elements: IntegerLiteral[][],
    ) { super(); }
}

// some predefined literals for matrices to be reused in test cases

const matrixLiteral1x1 = new MatrixLiteral([
    [new IntegerLiteral(1)],
]);

const matrixLiteral2x2 = new MatrixLiteral([
    [new IntegerLiteral(1), new IntegerLiteral(2)],
    [new IntegerLiteral(3), new IntegerLiteral(4)],
]);
const matrixLiteral2x2Incomplete = new MatrixLiteral([
    [new IntegerLiteral(1), new IntegerLiteral(2)],
    [new IntegerLiteral(3), /* incomplete here */],
]);

const matrixLiteral3x3 = new MatrixLiteral([
    [new IntegerLiteral(1), new IntegerLiteral(2), new IntegerLiteral(3)],
    [new IntegerLiteral(4), new IntegerLiteral(5), new IntegerLiteral(6)],
    [new IntegerLiteral(7), new IntegerLiteral(8), new IntegerLiteral(9)],
]);
const matrixLiteral3x3Incomplete = new MatrixLiteral([
    [new IntegerLiteral(1), new IntegerLiteral(2), new IntegerLiteral(3)],
    [new IntegerLiteral(4), new IntegerLiteral(5), new IntegerLiteral(6)],
    [new IntegerLiteral(7), new IntegerLiteral(8), /* incomplete here */],
]);
