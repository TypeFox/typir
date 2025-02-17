/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { describe, expect, test } from 'vitest';
import { createTypirServicesForTesting, expectTypirTypes } from '../../../src/utils/test-utils.js';
import { assertType } from '../../../src/utils/utils.js';
import { isPrimitiveType } from '../../../src/kinds/primitive/primitive-type.js';

describe('Tests some details for primitive types', () => {

    test('create primitive and get it by name', () => {
        const typir = createTypirServicesForTesting();
        const integerType1 = typir.factory.Primitives.create({ primitiveName: 'integer' }).finish();
        assertType(integerType1, isPrimitiveType, 'integer');
        expectTypirTypes(typir, isPrimitiveType, 'integer');
        const integerType2 = typir.factory.Primitives.get({ primitiveName: 'integer' });
        assertType(integerType2, isPrimitiveType, 'integer');
        expect(integerType1).toBe(integerType2);
    });

    test('error when trying to create the same primitive twice', () => {
        const typir = createTypirServicesForTesting();
        // create the 1st integer
        const integerType1 = typir.factory.Primitives.create({ primitiveName: 'integer' }).finish();
        assertType(integerType1, isPrimitiveType, 'integer');
        // creating the 2nd integer will fail
        expect(() => typir.factory.Primitives.create({ primitiveName: 'integer' }).finish())
            .toThrowError();
    });

});
