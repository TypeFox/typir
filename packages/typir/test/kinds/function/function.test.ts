/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { describe, expect, test } from 'vitest';
import { createTypirServicesForTesting } from '../../../src/test/predefined-language-nodes.js';

describe('Tests functions', () => {

    test('Create two functions with different parameter types, which are marked as equal => functions are equal', () => {
        const typir = createTypirServicesForTesting();

        // primitive types
        const typeA = typir.factory.Primitives.create({ primitiveName: 'A' }).finish();
        const typeB = typir.factory.Primitives.create({ primitiveName: 'B' }).finish();
        const typeVoid = typir.factory.Primitives.create({ primitiveName: 'void' }).finish();

        // TODO Review: If the following line is moved below after the creation of functions, the functions are not equal!
        typir.Equality.markAsEqual(typeA, typeB);

        // the functions use different types for their input parameter 'p1' ...
        const functionA = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: typeA }],
            outputParameter: { name: 'out', type: typeVoid } }).finish().getTypeFinal()!;
        const functionB = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: typeB }],
            outputParameter: { name: 'out', type: typeVoid } }).finish().getTypeFinal()!;

        // but they are equal => the functions are equal as well
        expect(typir.Equality.areTypesEqual(functionA, functionB)).toBe(true);
    });

});
