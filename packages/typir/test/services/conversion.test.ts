/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { describe, expect, test } from 'vitest';
import { createTypirServicesForTesting } from '../../src/utils/test-utils.js';

describe('Testing conversion', () => {

    test('exception in case of cyclic conversion rules', () => {
        const typir = createTypirServicesForTesting();
        const integerType = typir.factory.Primitives.create({ primitiveName: 'integer' }).finish();
        const doubleType = typir.factory.Primitives.create({ primitiveName: 'double' }).finish();

        // define cyclic relationships between types
        typir.Conversion.markAsConvertible(integerType, doubleType, 'IMPLICIT_EXPLICIT');
        expect(() => typir.Conversion.markAsConvertible(doubleType, integerType, 'IMPLICIT_EXPLICIT'))
            .toThrowError('Adding the conversion from double to integer with mode IMPLICIT_EXPLICIT has introduced a cycle in the type graph.');
    });

});
