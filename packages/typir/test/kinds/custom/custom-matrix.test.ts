/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { describe, expect, test } from 'vitest';
import { TypeInitializer } from '../../../src/initialization/type-initializer.js';
import { TypeReference } from '../../../src/initialization/type-reference.js';
import { CustomTypeInitialization, CustomTypeProperties, CustomTypeStorage } from '../../../src/kinds/custom/custom-definitions.js';
import { CustomKind } from '../../../src/kinds/custom/custom-kind.js';
import { isCustomType } from '../../../src/kinds/custom/custom-type.js';
import { isPrimitiveType, PrimitiveType } from '../../../src/kinds/primitive/primitive-type.js';
import { TestLanguageNode } from '../../../src/test/predefined-language-nodes.js';
import { createTypirServicesForTesting, expectToBeType, expectTypirTypes } from '../../../src/utils/test-utils.js';
import { assertTypirType } from '../../../src/index.js';

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
            calculateIdentifier: properties =>
                `custom-matrix-${typir.infrastructure.TypeResolver.resolve(properties.baseType).getIdentifier()}-${properties.width}-${properties.height}`,
        });

        // now use this custom kind to create some custom types
        const matrix2x2 = customKind // "lazy" to use matrix2x2 as 'baseType' => review ZOD, separate primitives and Typir-Types
            .create({ typeName: 'My2x2MatrixType', properties: { baseType: integerType, width: 2, height: 2 } })
            // .create({ typeName: 'My2x2MatrixType', properties: { baseType: () => customKind.get({ }), width: 2, height: 2 } })
            // .inferenceRule({ TODO })
            .finish().getTypeFinal()!; // we know, that the new custom type depends only on types which are already available
        expect(typir.Printer.printTypeUserRepresentation(matrix2x2)).toBe('My2x2MatrixType');
        assertTypirType(matrix2x2, type => isCustomType(type, customKind), 'My2x2MatrixType');
        expectTypirTypes(typir, type => isCustomType(type, customKind), 'My2x2MatrixType');
        expect(matrix2x2.properties.width).toBe(2);
        expect(matrix2x2.properties.height).toBe(2);
        expectToBeType(matrix2x2.properties.baseType.getType(), isPrimitiveType, type => type === integerType); // TODO get rid of ".getType()" ?

        const matrix3x3 = customKind
            .create({ typeName: 'My3x3MatrixType', properties: { baseType: integerType, width: 3, height: 3 } })
            // .inferenceRule({ TODO })
            .finish().getTypeFinal()!; // we know, that the new custom type depends only on types which are already available
        expect(typir.Printer.printTypeUserRepresentation(matrix3x3)).toBe('My3x3MatrixType');
        assertTypirType(matrix3x3, type => isCustomType(type, customKind), 'My3x3MatrixType');
        expectTypirTypes(typir, type => isCustomType(type, customKind), 'My2x2MatrixType', 'My3x3MatrixType');
        expect(matrix3x3.properties.width).toBe(3);
        expect(matrix3x3.properties.height).toBe(3);
        expectToBeType(matrix3x3.properties.baseType.getType(), isPrimitiveType, type => type === integerType);
    });

    // TODO test cases for: different TypeSelectors, inference rules, validation rules, assignability, Set/Array/Map

});
