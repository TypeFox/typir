/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { beforeEach, describe, expect, test } from 'vitest';
import { CustomKind } from '../../../src/kinds/custom/custom-kind.js';
import { isCustomType } from '../../../src/kinds/custom/custom-type.js';
import { TestLanguageNode } from '../../../src/test/predefined-language-nodes.js';
import { TypirServices } from '../../../src/typir.js';
import { createTypirServicesForTesting, expectTypirTypes } from '../../../src/utils/test-utils.js';

// These test cases test that it is possible to work with two different kinds of custom types independent from each other in the same Typir instance,
// even when these custom types/kinds have the same properties!

export type MyCustomType1 = {
    myNumber: number;
    myString: string;
};
export type MyCustomType2 = MyCustomType1;


describe('Check that different custom types can be used in parallel', () => {
    let typir: TypirServices<TestLanguageNode>;
    let customKind1: CustomKind<MyCustomType1, TestLanguageNode>;
    let customKind2: CustomKind<MyCustomType2, TestLanguageNode>;

    beforeEach(() => {
        typir = createTypirServicesForTesting();

        customKind1 = new CustomKind<MyCustomType1, TestLanguageNode>(typir, {
            name: 'MyCustom1',
            // use the default 'calculateTypeIdentifier' implementation here
            calculateTypeName: properties => `Custom1-${properties.myNumber}`,
        });
        customKind2 = new CustomKind<MyCustomType2, TestLanguageNode>(typir, {
            name: 'MyCustom2',
            // use the default 'calculateTypeIdentifier' implementation here
            calculateTypeName: properties => `Custom1-${properties.myNumber}`, // same names! but different identifiers!
        });
    });

    test('The name of CustomKinds needs to be unique', () => {
        expect(() => new CustomKind<MyCustomType1, TestLanguageNode>(typir, {
            name: 'MyCustom1',
            calculateTypeIdentifier: () => 'does not matter',
        })).toThrowError("duplicate kind named 'CustomKind-MyCustom1'");
    });

    test('The name of CustomKinds needs to be unique: a different <GenericType> is not enough', () => {
        expect(() => new CustomKind<MyCustomType1, TestLanguageNode>(typir, {
            name: 'MyCustom2',
            calculateTypeIdentifier: () => 'does not matter',
        })).toThrowError("duplicate kind named 'CustomKind-MyCustom2'");
    });

    test('The name of CustomKinds needs to be unique: it needs to be a different name', () => {
        new CustomKind<MyCustomType1, TestLanguageNode>(typir, {
            name: 'MyCustom',
            calculateTypeIdentifier: () => 'does not matter',
        });
    });

    test('Same properties, but different types', () => {
        const typeA1 = customKind1.create({ properties: { myNumber: 222, myString: 'Two' } }).finish().getTypeFinal()!;
        const typeA2 = customKind2.create({ properties: { myNumber: 222, myString: 'Two' } }).finish().getTypeFinal()!;
        expect(typeA1 === typeA2).toBe(false); // different types ...
        expect(typeA1.kind).toBe(customKind1); // ... with different kinds
        expect(typeA2.kind).toBe(customKind2);
        expect(typeA1.getIdentifier()).not.toBe(typeA2.getIdentifier()); // different identifiers
        expect(typeA1.getName()).toBe(typeA2.getName()); // same name (here for testing, in general, that usually does not make sense!)
        // we have a single type for both kinds:
        expectTypirTypes(typir, type => isCustomType(type, customKind1), 'Custom1-222');
        expectTypirTypes(typir, type => isCustomType(type, customKind2), 'Custom1-222');
    });

});
