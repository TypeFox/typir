/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { describe, expect, test } from 'vitest';
import { assertTypirType, InferenceRuleNotApplicable, ValidationProblemAcceptor } from '../../../src/index.js';
import { TypeInitializer } from '../../../src/initialization/type-initializer.js';
import { TypeReference } from '../../../src/initialization/type-reference.js';
import { CustomTypeInitialization, CustomTypeProperties, CustomTypeStorage } from '../../../src/kinds/custom/custom-definitions.js';
import { CustomKind } from '../../../src/kinds/custom/custom-kind.js';
import { CustomType, isCustomType } from '../../../src/kinds/custom/custom-type.js';
import { isPrimitiveType, PrimitiveType } from '../../../src/kinds/primitive/primitive-type.js';
import { IntegerLiteral, TestExpressionNode, TestLanguageNode } from '../../../src/test/predefined-language-nodes.js';
import { createTypirServicesForTesting, expectToBeType, expectTypirTypes, expectValidationIssuesNone, expectValidationIssuesStrict } from '../../../src/utils/test-utils.js';

export type MatrixType = { // "interface" instead of "type" does not work!
    baseType: PrimitiveType;
    // baseTypes: PrimitiveType[];
    width: number;
    height: number;
    // map: Map<string, PrimitiveType>;
    // parent: MatrixType;  // TODO how to support this?
    // height2: number[][]; // works
    // gol: TestClass;      // not supported
}; // TODO satisfies CustomTypeProperties ??

// export class TestClass {}

export function createType<T extends CustomTypeProperties>(_values: T) {

}


describe('Tests simple custom types for Matrix types', () => {

    test('some experiments', () => {
        const typir = createTypirServicesForTesting();
        const integerType = typir.factory.Primitives.create({ primitiveName: 'Integer' }).finish();
        // const mapValue: Map<string, PrimitiveType> = new Map();

        const matrixValues: MatrixType = {
            baseType: integerType,
            // baseTypes: [integerType],
            width: 2,
            height: 3,
            // map: mapValue,
            // height2: [[3]],
            // gol: new TestClass(),
        };

        // using
        const k1: CustomTypeProperties = matrixValues;
        console.log(k1);

        createType<MatrixType>(matrixValues);


        // TypeSelector
        const typeInitializer: TypeInitializer<PrimitiveType, TestLanguageNode> = undefined!;
        const k2: CustomTypeInitialization<MatrixType, TestLanguageNode> = {
            baseType: typeInitializer,
            // baseTypes: ['Selector for integerType'],
            width: 2,
            height: 3,
            // map: mapValue,
        };
        console.log(k2);

        // TypeReference
        const typeReference: TypeReference<PrimitiveType, TestLanguageNode> = undefined!;
        // const mapReference: Map<string, TypeReference<PrimitiveType, TestLanguageNode>> = undefined!;
        const k3: CustomTypeStorage<MatrixType, TestLanguageNode> = {
            baseType: typeReference,
            // baseTypes: [integerType],
            // baseTypes: [typeReference],
            width: 2,
            height: 3,
            // map: mapReference,
        };
        console.log(k3);
    });

    test('Matrix type', () => {
        const typir = createTypirServicesForTesting();
        // TODO does not yet work: { factory: { Matrix: services => new CustomKind<MatrixType, TestLanguageNode>(services, { ... }) } }
        const integerType = typir.factory.Primitives.create({ primitiveName: 'Integer' }).finish();

        // create a custom kind to create custom types with dedicated properties, as defined in <MatrixType>
        const customKind = new CustomKind<MatrixType, TestLanguageNode>(typir, {
            name: 'Matrix',
            // determine which identifier is used to store and retrieve a custom type in the type graph (and to check its uniqueness)
            calculateTypeIdentifier: properties =>
                `custom-matrix-${typir.infrastructure.TypeResolver.resolve(properties.baseType).getIdentifier()}-${properties.width}-${properties.height}`,
        });

        // now use this custom kind to create some custom types
        const matrix2x2 = customKind // "lazy" to use matrix2x2 as 'baseType' => review ZOD, separate primitives and Typir-Types
            .create({ typeName: 'My2x2MatrixType', properties: { baseType: integerType, width: 2, height: 2 } })
            .finish().getTypeFinal()!; // we know, that the new custom type depends only on types which are already available
        expect(typir.Printer.printTypeUserRepresentation(matrix2x2)).toBe('My2x2MatrixType');
        assertTypirType(matrix2x2, type => isCustomType(type, customKind), 'My2x2MatrixType');
        expectTypirTypes(typir, type => isCustomType(type, customKind), 'My2x2MatrixType');
        expect(matrix2x2.properties.width).toBe(2);
        expect(matrix2x2.properties.height).toBe(2);
        expectToBeType(matrix2x2.properties.baseType.getType(), isPrimitiveType, type => type === integerType); // TODO get rid of ".getType()" ?

        const matrix3x3 = customKind
            .create({ typeName: 'My3x3MatrixType', properties: { baseType: integerType, width: 3, height: 3 } })
            .finish().getTypeFinal()!; // we know, that the new custom type depends only on types which are already available
        expect(typir.Printer.printTypeUserRepresentation(matrix3x3)).toBe('My3x3MatrixType');
        assertTypirType(matrix3x3, type => isCustomType(type, customKind), 'My3x3MatrixType');
        expectTypirTypes(typir, type => isCustomType(type, customKind), 'My2x2MatrixType', 'My3x3MatrixType');
        expect(matrix3x3.properties.width).toBe(3);
        expect(matrix3x3.properties.height).toBe(3);
        expectToBeType(matrix3x3.properties.baseType.getType(), isPrimitiveType, type => type === integerType);
    });

    test('Matrix type with very simple inference rules', () => {
        const typir = createTypirServicesForTesting();
        const integerType = typir.factory.Primitives.create({ primitiveName: 'Integer' }).finish();
        const customKind = new CustomKind<MatrixType, TestLanguageNode>(typir, {
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
        const customKind = new CustomKind<MatrixType, TestLanguageNode>(typir, {
            name: 'Matrix',
            calculateTypeIdentifier: properties =>
                `custom-matrix-${typir.infrastructure.TypeResolver.resolve(properties.baseType).getIdentifier()}-${properties.width}-${properties.height}`,
        });

        function checkCompleteness(node: MatrixLiteral, matrixType: CustomType<MatrixType, TestLanguageNode>, accept: ValidationProblemAcceptor<TestLanguageNode>): void {
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
        const customKind = new CustomKind<MatrixType, TestLanguageNode>(typir, {
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
                const width = node.elements.length;
                const height = node.elements.map(row => row.length).reduce((l, r) => Math.max(l, r), 0);
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
        const customKind = new CustomKind<MatrixType, TestLanguageNode>(typir, {
            name: 'Matrix',
            calculateTypeIdentifier: properties =>
                `custom-matrix-${typir.infrastructure.TypeResolver.resolve(properties.baseType).getIdentifier()}-${properties.width}-${properties.height}`,
        });
        // a single, generic inference rule
        typir.Inference.addInferenceRule(node => {
            if (node instanceof MatrixLiteral) {
                const width = node.elements.length;
                const height = node.elements.map(row => row.length).reduce((l, r) => Math.max(l, r), 0);
                return customKind.create({ typeName: 'My1x1MatrixType', properties: { baseType: integerType, width, height }})
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
    });

    // TODO test cases for: different TypeSelectors, Set/Array/Map, .getTypeFinal()! überprüfen

});

/* eslint-disable @typescript-eslint/parameter-properties */

class MatrixLiteral extends TestExpressionNode {
    constructor(
        public elements: IntegerLiteral[][],
    ) { super(); }
}

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
