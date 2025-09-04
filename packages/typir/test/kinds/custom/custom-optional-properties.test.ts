/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { beforeEach, describe, expect, test } from 'vitest';
import { CustomKind } from '../../../src/kinds/custom/custom-kind.js';
import { TestingSpecifics, createTypirServicesForTesting } from '../../../src/test/predefined-language-nodes.js';
import { TypirServices } from '../../../src/typir.js';

// These test cases test custom types with optional properties

describe('Optional custom properties', () => {
    type MyCustomType = {
        myNumber?: number;
        myString?: string;
    };

    let typir: TypirServices<TestingSpecifics>;
    let customKind: CustomKind<MyCustomType, TestingSpecifics>;

    beforeEach(() => {
        typir = createTypirServicesForTesting();

        customKind = new CustomKind<MyCustomType, TestingSpecifics>(typir, {
            name: 'MyCustom1',
            calculateTypeName: properties => `Custom1-${properties.myNumber}-${properties.myString}`,
        });
    });

    test('Specified non-undefined values', () => {
        const properties = customKind.create({ properties: { myNumber: 123, myString: 'hello' } }).finish().getTypeFinal()!.properties;
        expect(properties.myNumber).toBe(123);
        expect(properties.myString).toBe('hello');
    });

    test('Skipped all values (implicit undefined)', () => {
        const properties = customKind.create({ properties: { /* empty */ } }).finish().getTypeFinal()!.properties;
        expect(properties.myNumber).toBe(undefined);
        expect(properties.myString).toBe(undefined);
    });

    test('Used "undefined" as values (explicit undefined)', () => {
        const properties = customKind.create({ properties: { myNumber: undefined, myString: undefined } }).finish().getTypeFinal()!.properties;
        expect(properties.myNumber).toBe(undefined);
        expect(properties.myString).toBe(undefined);
    });

});
