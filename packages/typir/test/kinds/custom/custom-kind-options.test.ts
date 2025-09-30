/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { describe, expect, test } from 'vitest';
import { isPrimitiveType } from '../../../src/kinds/primitive/primitive-type.js';
import { Type } from '../../../src/graph/type-node.js';
import { TypirServices } from '../../../src/typir.js';
import { CustomKind, CustomKindOptions } from '../../../src/kinds/custom/custom-kind.js';
import { createTypirServicesForTesting, TestingSpecifics } from '../../../src/test/predefined-language-nodes.js';

// These test cases test some other aspects of custom types

describe('Test custom kind options', () => {
    let typir: TypirServices<TestingSpecifics>;
    type MyProperties = {
        name: string;
    };
    let customKind: CustomKind<MyProperties, TestingSpecifics>;


    function setup(options: Partial<CustomKindOptions<MyProperties, TestingSpecifics>>): void {
        typir = createTypirServicesForTesting();

        customKind = new CustomKind<MyProperties, TestingSpecifics>(typir, {
            name: 'MyCustom',
            calculateTypeName: properties => `Custom-${properties.name}`,
            ...options,
        });
    }

    test('Test calculated identifier', () => {
        setup({
            calculateTypeIdentifier: properties => `Custom-ID-${properties.name}`,
        });
        const customA = customKind.create({ properties: { name: 'CustomA' } }).finish().getTypeFinal()!;
        expect(customA.getIdentifier()).toBe('Custom-ID-CustomA');
        const customB = customKind.create({ properties: { name: 'CustomB' } }).finish().getTypeFinal()!;
        expect(customB.getIdentifier()).toBe('Custom-ID-CustomB');
    });

    test('Test calculated name', () => {
        setup({
            calculateTypeName: properties => `Name-${properties.name}`,
        });
        const customA = customKind.create({ properties: { name: 'CustomA' } }).finish().getTypeFinal()!;
        expect(customA.getName()).toBe('Name-CustomA');
        const customB = customKind.create({ properties: { name: 'CustomB' } }).finish().getTypeFinal()!;
        expect(customB.getName()).toBe('Name-CustomB');
    });

    test('Test calculated user representation', () => {
        setup({
            calculateTypeUserRepresentation: properties => `The custom long description for ${properties.name}!`,
        });
        const customA = customKind.create({ properties: { name: 'CustomA' } }).finish().getTypeFinal()!;
        expect(customA.getUserRepresentation()).toBe('The custom long description for CustomA!');
        const customB = customKind.create({ properties: { name: 'CustomB' } }).finish().getTypeFinal()!;
        expect(customB.getUserRepresentation()).toBe('The custom long description for CustomB!');
    });

    describe('Test configurations for static relationships to other types', () => {

        test('Custom type is super-type of a primitive type', () => {
            setup({
                getSubTypesOfNewCustomType: (_superNewCustom) => [typir.factory.Primitives.get({ primitiveName: 'A' })!],
            });
            const primitiveA = typir.factory.Primitives.create({ primitiveName: 'A' }).finish();
            const primitiveB = typir.factory.Primitives.create({ primitiveName: 'B' }).finish();
            const customA = customKind.create({ properties: { name: 'CustomA' } }).finish().getTypeFinal()!;
            expectAssignability(primitiveA, customA);
            expectAssignabilityNone(primitiveB, customA);
        });

        test('Custom type is sub-type of a primitive type', () => {
            setup({
                getSuperTypesOfNewCustomType: (_subNewCustom) => [typir.factory.Primitives.get({ primitiveName: 'A' })!],
            });
            const primitiveA = typir.factory.Primitives.create({ primitiveName: 'A' }).finish();
            const primitiveB = typir.factory.Primitives.create({ primitiveName: 'B' }).finish();
            const customA = customKind.create({ properties: { name: 'CustomA' } }).finish().getTypeFinal()!;
            expectAssignability(customA, primitiveA);
            expectAssignabilityNone(customA, primitiveB);
        });

        test('Custom type is implicitly convertible to a primitive type', () => {
            setup({
                getNewCustomTypeImplicitlyConvertibleToTypes: (_fromNewCustom) => [typir.factory.Primitives.get({ primitiveName: 'A' })!],
            });
            const primitiveA = typir.factory.Primitives.create({ primitiveName: 'A' }).finish();
            const primitiveB = typir.factory.Primitives.create({ primitiveName: 'B' }).finish();
            const customA = customKind.create({ properties: { name: 'CustomA' } }).finish().getTypeFinal()!;
            expectAssignability(customA, primitiveA);
            expectAssignabilityNone(customA, primitiveB);
        });

        test('A primitive type is implicitly convertible to the custom type', () => {
            setup({
                getTypesImplicitlyConvertibleToNewCustomType: (_toNewCustom) => [typir.factory.Primitives.get({ primitiveName: 'A' })!],
            });
            const primitiveA = typir.factory.Primitives.create({ primitiveName: 'A' }).finish();
            const primitiveB = typir.factory.Primitives.create({ primitiveName: 'B' }).finish();
            const customA = customKind.create({ properties: { name: 'CustomA' } }).finish().getTypeFinal()!;
            expectAssignability(primitiveA, customA);
            expectAssignabilityNone(primitiveB, customA);
        });

        test('Custom type is explicitly convertible to a primitive type', () => {
            setup({
                getNewCustomTypeExplicitlyConvertibleToTypes: (_fromNewCustom) => [typir.factory.Primitives.get({ primitiveName: 'A' })!],
            });
            const primitiveA = typir.factory.Primitives.create({ primitiveName: 'A' }).finish();
            const primitiveB = typir.factory.Primitives.create({ primitiveName: 'B' }).finish();
            const customA = customKind.create({ properties: { name: 'CustomA' } }).finish().getTypeFinal()!;
            expect(typir.Conversion.isConvertible(customA, primitiveA)).toBe(true);
            expect(typir.Conversion.isConvertible(primitiveA, customA)).toBe(false);
            expect(typir.Conversion.isConvertible(customA, primitiveB)).toBe(false);
            expect(typir.Conversion.isConvertible(primitiveB, customA)).toBe(false);
        });

        test('A primitive type is explicitly convertible to the custom type', () => {
            setup({
                getTypesExplicitlyConvertibleToNewCustomType: (_toNewCustom) => [typir.factory.Primitives.get({ primitiveName: 'A' })!],
            });
            const primitiveA = typir.factory.Primitives.create({ primitiveName: 'A' }).finish();
            const primitiveB = typir.factory.Primitives.create({ primitiveName: 'B' }).finish();
            const customA = customKind.create({ properties: { name: 'CustomA' } }).finish().getTypeFinal()!;
            expect(typir.Conversion.isConvertible(primitiveA, customA)).toBe(true);
            expect(typir.Conversion.isConvertible(customA, primitiveA)).toBe(false);
            expect(typir.Conversion.isConvertible(primitiveB, customA)).toBe(false);
            expect(typir.Conversion.isConvertible(customA, primitiveB)).toBe(false);
        });

        test('Custom type is equal to a primitive type', () => {
            setup({
                getEqualTypesForNewCustomType: (_newCustom) => [typir.factory.Primitives.get({ primitiveName: 'A' })!],
            });
            const primitiveA = typir.factory.Primitives.create({ primitiveName: 'A' }).finish();
            const primitiveB = typir.factory.Primitives.create({ primitiveName: 'B' }).finish();
            const customA = customKind.create({ properties: { name: 'CustomA' } }).finish().getTypeFinal()!;
            expectAssignabilityBoth(customA, primitiveA);
            expectAssignabilityNone(customA, primitiveB);
        });

    });

    describe('Test configurations for dynamic relationships to other types', () => {

        test('Custom type is sub-type of all primitive types', () => {
            setup({
                isNewCustomTypeSubTypeOf: (_subNewCustom, superOther) => isPrimitiveType(superOther),
            });
            const primitiveA = typir.factory.Primitives.create({ primitiveName: 'A' }).finish();

            const customA = customKind.create({ properties: { name: 'CustomA' } }).finish().getTypeFinal()!;
            expectAssignability(customA, primitiveA);

            const primitiveB = typir.factory.Primitives.create({ primitiveName: 'B' }).finish();
            expectAssignability(customA, primitiveB);

            const customB = customKind.create({ properties: { name: 'CustomB' } }).finish().getTypeFinal()!;
            expectAssignability(customB, primitiveA);
            expectAssignability(customB, primitiveB);
            expectAssignabilityNone(customA, customB);
        });

        test('Custom type is super-type of all primitive types', () => {
            setup({
                isNewCustomTypeSuperTypeOf: (subOther, _superNewCustom) => isPrimitiveType(subOther),
            });
            const primitiveA = typir.factory.Primitives.create({ primitiveName: 'A' }).finish();

            const customA = customKind.create({ properties: { name: 'CustomA' } }).finish().getTypeFinal()!;
            expectAssignability(primitiveA, customA);

            const primitiveB = typir.factory.Primitives.create({ primitiveName: 'B' }).finish();
            expectAssignability(primitiveB, customA);

            const customB = customKind.create({ properties: { name: 'CustomB' } }).finish().getTypeFinal()!;
            expectAssignability(primitiveA, customB);
            expectAssignability(primitiveB, customB);
            expectAssignabilityNone(customA, customB);
        });

        test('Custom type is implicitly convertible to all primitive types', () => {
            setup({
                isNewCustomTypeConvertibleToType: (_fromNewCustom, toOther) => isPrimitiveType(toOther) ? 'IMPLICIT_EXPLICIT' : 'NONE',
            });
            const primitiveA = typir.factory.Primitives.create({ primitiveName: 'A' }).finish();

            const customA = customKind.create({ properties: { name: 'CustomA' } }).finish().getTypeFinal()!;
            expectAssignability(customA, primitiveA);

            const primitiveB = typir.factory.Primitives.create({ primitiveName: 'B' }).finish();
            expectAssignability(customA, primitiveB);

            const customB = customKind.create({ properties: { name: 'CustomB' } }).finish().getTypeFinal()!;
            expectAssignability(customB, primitiveA);
            expectAssignability(customB, primitiveB);
            expectAssignabilityNone(customA, customB);
        });

        test('All primitive types are implicitly convertible to a custom type', () => {
            setup({
                isTypeConvertibleToNewCustomType: (fromOther, _toNewCustom) => isPrimitiveType(fromOther) ? 'IMPLICIT_EXPLICIT' : 'NONE',
            });
            const primitiveA = typir.factory.Primitives.create({ primitiveName: 'A' }).finish();

            const customA = customKind.create({ properties: { name: 'CustomA' } }).finish().getTypeFinal()!;
            expectAssignability(primitiveA, customA);

            const primitiveB = typir.factory.Primitives.create({ primitiveName: 'B' }).finish();
            expectAssignability(primitiveB, customA);

            const customB = customKind.create({ properties: { name: 'CustomB' } }).finish().getTypeFinal()!;
            expectAssignability(primitiveA, customB);
            expectAssignability(primitiveB, customB);
            expectAssignabilityNone(customA, customB);
        });

        test('Custom type is equal to all primitive types', () => {
            setup({
                isNewCustomTypeEqualTo: (_newCustom, other) => isPrimitiveType(other),
            });
            const primitiveA = typir.factory.Primitives.create({ primitiveName: 'A' }).finish();

            const customA = customKind.create({ properties: { name: 'A' } }).finish().getTypeFinal()!;
            expectAssignabilityBoth(customA, primitiveA);

            const primitiveB = typir.factory.Primitives.create({ primitiveName: 'B' }).finish();
            expectAssignabilityBoth(customA, primitiveB);

            const customB = customKind.create({ properties: { name: 'B' } }).finish().getTypeFinal()!;
            expectAssignabilityBoth(customB, primitiveA);
            expectAssignabilityBoth(customB, primitiveB);
            expectAssignabilityBoth(customA, customB); // since equality and assignability are transitive!
        });

        test('Custom type is equal to primitive types, if both types have the same name', () => {
            setup({
                isNewCustomTypeEqualTo: (newCustom, other) => isPrimitiveType(other) && newCustom.properties.name === other.getName(),
            });
            const primitiveA = typir.factory.Primitives.create({ primitiveName: 'A' }).finish();

            const customA = customKind.create({ properties: { name: 'A' } }).finish().getTypeFinal()!;
            expectAssignabilityBoth(customA, primitiveA); // same names

            const primitiveB = typir.factory.Primitives.create({ primitiveName: 'B' }).finish();
            expectAssignabilityNone(customA, primitiveB); // different names

            const customB = customKind.create({ properties: { name: 'B' } }).finish().getTypeFinal()!;
            expectAssignabilityNone(customB, primitiveA); // different names
            expectAssignabilityBoth(customB, primitiveB); // same names
            expectAssignabilityNone(customA, customB); // there is no transitive assignability path
        });

    });

    function expectAssignability(from: Type, to: Type): void {
        expect(typir.Assignability.isAssignable(from, to)).toBe(true);
        expect(typir.Assignability.isAssignable(to, from)).toBe(false);
    }
    function expectAssignabilityBoth(from: Type, to: Type): void {
        expect(typir.Assignability.isAssignable(from, to)).toBe(true);
        expect(typir.Assignability.isAssignable(to, from)).toBe(true);
    }
    function expectAssignabilityNone(from: Type, to: Type): void {
        expect(typir.Assignability.isAssignable(from, to)).toBe(false);
        expect(typir.Assignability.isAssignable(to, from)).toBe(false);
    }

});
