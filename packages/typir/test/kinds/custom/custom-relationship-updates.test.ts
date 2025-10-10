/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { beforeEach, describe, expect, test } from 'vitest';
import { CustomType } from '../../../src/kinds/custom/custom-type.js';
import { CustomKind } from '../../../src/kinds/custom/custom-kind.js';
import { PrimitiveType } from '../../../src/kinds/primitive/primitive-type.js';
import { createTypirServicesForTesting, TestingSpecifics } from '../../../src/test/predefined-language-nodes.js';
import { TypirServices } from '../../../src/typir.js';

// These test cases test some other aspects of custom types

describe('Create two custom types with different types as values for properties, which are marked as equal => custom types are equal', () => {
    type MyProperties1 = {
        myType1: PrimitiveType;
    };
    type MyProperties2 = {
        myType2: CustomType<MyProperties1, TestingSpecifics>;
    };

    let typir: TypirServices<TestingSpecifics>;
    let primitiveA: PrimitiveType;
    let primitiveB: PrimitiveType;
    let customKind1: CustomKind<MyProperties1, TestingSpecifics>;
    let customKind2: CustomKind<MyProperties2, TestingSpecifics>;

    beforeEach(() => {
        typir = createTypirServicesForTesting();

        // primitive types
        primitiveA = typir.factory.Primitives.create({ primitiveName: 'A' }).finish();
        primitiveB = typir.factory.Primitives.create({ primitiveName: 'B' }).finish();

        // custom factories
        customKind1 = new CustomKind<MyProperties1, TestingSpecifics>(typir, {
            name: 'MyCustom1',
            calculateTypeName: properties => `Custom1-${properties.myType1.getType()?.getName()}`,
        });
        customKind2 = new CustomKind<MyProperties2, TestingSpecifics>(typir, {
            name: 'MyCustom2',
            calculateTypeName: properties => `Custom2-${properties.myType2.getType()?.getName()}`,
        });
    });

    test('Primitives are equal before creating the custom types', () => {
        // primitive types are marked to be equal
        typir.Equality.markAsEqual(primitiveA, primitiveB);

        // Therefore custom types with them as properties ...
        const customA = customKind1.create({ properties: { myType1: primitiveA } }).finish().getTypeFinal()!;
        const customB = customKind1.create({ properties: { myType1: primitiveB } }).finish().getTypeFinal()!;
        // ... are equal as well
        expect(typir.Equality.areTypesEqual(customA, customB)).toBe(true);

        // unmark the primitives types as equal => custom types are not equal anymore
        typir.Equality.unmarkAsEqual(primitiveA, primitiveB);
        expect(typir.Equality.areTypesEqual(customA, customB)).toBe(false);
    });

    test('Primitives are equal after creating the custom types', () => {
        const customA = customKind1.create({ properties: { myType1: primitiveA } }).finish().getTypeFinal()!;
        const customB = customKind1.create({ properties: { myType1: primitiveB } }).finish().getTypeFinal()!;
        expect(typir.Equality.areTypesEqual(customA, customB)).toBe(false);

        typir.Equality.markAsEqual(primitiveA, primitiveB);
        expect(typir.Equality.areTypesEqual(customA, customB)).toBe(true);

        typir.Equality.unmarkAsEqual(primitiveA, primitiveB);
        expect(typir.Equality.areTypesEqual(customA, customB)).toBe(false);
    });

    test('Custom types 2 use custom types 1 which use primitives, which are equal => transitive updates', () => {
        const customA = customKind1.create({ properties: { myType1: primitiveA } }).finish().getTypeFinal()!;
        const customB = customKind1.create({ properties: { myType1: primitiveB } }).finish().getTypeFinal()!;

        const customC = customKind2.create({ properties: { myType2: customA } }).finish().getTypeFinal()!;
        const customD = customKind2.create({ properties: { myType2: customB } }).finish().getTypeFinal()!;

        expect(typir.Equality.areTypesEqual(customA, customB)).toBe(false);
        expect(typir.Equality.areTypesEqual(customC, customD)).toBe(false);

        // mark the primitive types as equal
        typir.Equality.markAsEqual(primitiveA, primitiveB);
        expect(typir.Equality.areTypesEqual(customA, customB)).toBe(true);
        expect(typir.Equality.areTypesEqual(customC, customD)).toBe(true);

        typir.Equality.unmarkAsEqual(primitiveA, primitiveB);
        expect(typir.Equality.areTypesEqual(customA, customB)).toBe(false);
        expect(typir.Equality.areTypesEqual(customC, customD)).toBe(false);

        // mark the custom types 1 as equal
        typir.Equality.markAsEqual(customA, customB);
        expect(typir.Equality.areTypesEqual(customA, customB)).toBe(true);
        expect(typir.Equality.areTypesEqual(customC, customD)).toBe(true);

        typir.Equality.unmarkAsEqual(customA, customB);
        expect(typir.Equality.areTypesEqual(customA, customB)).toBe(false);
        expect(typir.Equality.areTypesEqual(customC, customD)).toBe(false);
    });

});
