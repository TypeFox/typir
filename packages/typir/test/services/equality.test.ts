/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { describe, expect, test } from 'vitest';
import { createTypirServicesForTesting } from '../../src/test/predefined-language-nodes.js';

describe('Testing equality (and some graph algorithms)', () => {

    test('direct equality between two types', () => {
        const typir = createTypirServicesForTesting();
        const integerType = typir.factory.Primitives.create({ primitiveName: 'integer' }).finish();
        const doubleType = typir.factory.Primitives.create({ primitiveName: 'double' }).finish();

        // the primitive types are neither equal nor assignable by default
        expect(typir.Equality.areTypesEqual(integerType, doubleType)).toBe(false);
        expect(typir.Equality.areTypesEqual(doubleType, integerType)).toBe(false);
        expect(typir.Assignability.isAssignable(integerType, doubleType)).toBe(false);
        expect(typir.Assignability.isAssignable(doubleType, integerType)).toBe(false);

        typir.Equality.markAsEqual(integerType, doubleType);

        // now the primitive types are equal and assignable
        expect(typir.Equality.areTypesEqual(integerType, doubleType)).toBe(true);
        expect(typir.Equality.areTypesEqual(doubleType, integerType)).toBe(true);
        expect(typir.Assignability.isAssignable(integerType, doubleType)).toBe(true);
        expect(typir.Assignability.isAssignable(doubleType, integerType)).toBe(true);
    });

    test('transitive equality', () => {
        const typir = createTypirServicesForTesting();
        const integerType = typir.factory.Primitives.create({ primitiveName: 'integer' }).finish();
        const floatType = typir.factory.Primitives.create({ primitiveName: 'float' }).finish();
        const doubleType = typir.factory.Primitives.create({ primitiveName: 'double' }).finish();

        // the primitive types are not equal by default
        expect(typir.Equality.areTypesEqual(integerType, doubleType)).toBe(false);
        expect(typir.Equality.areTypesEqual(doubleType, integerType)).toBe(false);
        expect(typir.Assignability.isAssignable(integerType, doubleType)).toBe(false);
        expect(typir.Assignability.isAssignable(doubleType, integerType)).toBe(false);

        typir.Equality.markAsEqual(integerType, floatType);
        typir.Equality.markAsEqual(floatType, doubleType);

        // now the primitive types are equal
        expect(typir.Equality.areTypesEqual(integerType, doubleType)).toBe(true);
        expect(typir.Equality.areTypesEqual(doubleType, integerType)).toBe(true);
        expect(typir.Assignability.isAssignable(integerType, doubleType)).toBe(true);
        expect(typir.Assignability.isAssignable(doubleType, integerType)).toBe(true);
    });

    test('transitive equality (equality is defined in inverse order)', () => {
        const typir = createTypirServicesForTesting();
        const integerType = typir.factory.Primitives.create({ primitiveName: 'integer' }).finish();
        const floatType = typir.factory.Primitives.create({ primitiveName: 'float' }).finish();
        const doubleType = typir.factory.Primitives.create({ primitiveName: 'double' }).finish();

        typir.Equality.markAsEqual(doubleType, floatType);
        typir.Equality.markAsEqual(floatType, integerType);

        // now the primitive types are equal
        expect(typir.Equality.areTypesEqual(integerType, doubleType)).toBe(true);
        expect(typir.Equality.areTypesEqual(doubleType, integerType)).toBe(true);
        expect(typir.Assignability.isAssignable(integerType, doubleType)).toBe(true);
        expect(typir.Assignability.isAssignable(doubleType, integerType)).toBe(true);
    });

    test('transitive equality (equality is defined in inconsistent order)', () => {
        const typir = createTypirServicesForTesting();
        const integerType = typir.factory.Primitives.create({ primitiveName: 'integer' }).finish();
        const floatType = typir.factory.Primitives.create({ primitiveName: 'float' }).finish();
        const doubleType = typir.factory.Primitives.create({ primitiveName: 'double' }).finish();

        typir.Equality.markAsEqual(floatType, doubleType);
        typir.Equality.markAsEqual(floatType, integerType);

        // now the primitive types are equal
        expect(typir.Equality.areTypesEqual(integerType, doubleType)).toBe(true);
        expect(typir.Equality.areTypesEqual(doubleType, integerType)).toBe(true);
        expect(typir.Assignability.isAssignable(integerType, doubleType)).toBe(true);
        expect(typir.Assignability.isAssignable(doubleType, integerType)).toBe(true);
    });

    test('equality completely defined including a circle', () => {
        const typir = createTypirServicesForTesting();
        const integerType = typir.factory.Primitives.create({ primitiveName: 'integer' }).finish();
        const floatType = typir.factory.Primitives.create({ primitiveName: 'float' }).finish();
        const doubleType = typir.factory.Primitives.create({ primitiveName: 'double' }).finish();

        typir.Equality.markAsEqual(integerType, floatType);
        typir.Equality.markAsEqual(floatType, doubleType);
        typir.Equality.markAsEqual(doubleType, integerType);

        // now the primitive types are equal
        expect(typir.Equality.areTypesEqual(integerType, doubleType)).toBe(true);
        expect(typir.Equality.areTypesEqual(doubleType, integerType)).toBe(true);
        expect(typir.Assignability.isAssignable(integerType, doubleType)).toBe(true);
        expect(typir.Assignability.isAssignable(doubleType, integerType)).toBe(true);
    });

});
