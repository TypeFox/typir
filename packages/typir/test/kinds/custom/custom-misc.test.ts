/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { describe, expect, test } from 'vitest';
import { PrimitiveType } from '../../../src/kinds/primitive/primitive-type.js';
import { CustomKind } from '../../../src/kinds/custom/custom-kind.js';
import { createTypirServicesForTesting, TestingSpecifics } from '../../../src/test/predefined-language-nodes.js';

// These test cases test some other aspects of custom types

describe('Misc', () => {

    test('Create two custom types with different types as values for properties, which are marked as equal => custom types are equal', () => {
        type MyProperties = {
            myType: PrimitiveType;
        };
        const typir = createTypirServicesForTesting();
        const customKind1 = new CustomKind<MyProperties, TestingSpecifics>(typir, {
            name: 'MyCustom',
            calculateTypeName: properties => `Custom-${properties.myType.getType()?.getName()}`,
        });

        // primitive types are marked to be equal
        const typeA = typir.factory.Primitives.create({ primitiveName: 'A' }).finish();
        const typeB = typir.factory.Primitives.create({ primitiveName: 'B' }).finish();
        typir.Equality.markAsEqual(typeA, typeB);

        // Therefore custom types with them as properties ...
        const customA = customKind1.create({ properties: { myType: typeA } }).finish().getTypeFinal()!;
        const customB = customKind1.create({ properties: { myType: typeB } }).finish().getTypeFinal()!;
        // ... are equal as well
        expect(typir.Equality.areTypesEqual(customA, customB)).toBe(true);
    });

});
