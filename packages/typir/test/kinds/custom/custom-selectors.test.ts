/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { beforeEach, describe, expect, test } from 'vitest';
import { CustomKind } from '../../../src/kinds/custom/custom-kind.js';
import { CustomType } from '../../../src/kinds/custom/custom-type.js';
import { TestExpressionNode, TestLanguageNode } from '../../../src/test/predefined-language-nodes.js';
import { TypirServices } from '../../../src/typir.js';
import { createTypirServicesForTesting } from '../../../src/utils/test-utils.js';

// These test cases test that all possible TypeSelectors work for custom types.

export type MyCustomProperties = {
    dependsOnType?: CustomType<MyCustomProperties, TestLanguageNode>;
    myProperty: number;
};

describe('Test all possible TypeSelectors with custom types', () => {
    let typir: TypirServices<TestLanguageNode>;
    let customKind: CustomKind<MyCustomProperties, TestLanguageNode>;

    beforeEach(() => {
        typir = createTypirServicesForTesting();

        customKind = new CustomKind<MyCustomProperties, TestLanguageNode>(typir, {
            name: 'MyCustom',
            calculateTypeIdentifier: properties =>
                `custom-${properties.myProperty}-(${properties.dependsOnType ? typir.infrastructure.TypeResolver.resolve(properties.dependsOnType).getIdentifier() : ''})`,
        });
    });

    test('Type', () => {
        // custom1 depends on nothing
        const custom1 = customKind.create({ properties: { myProperty: 1 } }).finish().getTypeFinal()!;
        // custom2 depends on custom1
        const custom2 = customKind.create({ properties: { dependsOnType: custom1, myProperty: 2 } }).finish().getTypeFinal()!;
        expect(custom2.properties.dependsOnType?.getType()).toBe(custom1);
    });
    test('() => Type', () => {
        // custom1 depends on nothing
        const custom1 = customKind.create({ properties: { myProperty: 1 } }).finish().getTypeFinal()!;
        // custom2 depends on custom1
        const custom2 = customKind.create({ properties: { dependsOnType: () => custom1, myProperty: 2 } }).finish().getTypeFinal()!;
        expect(custom2.properties.dependsOnType?.getType()).toBe(custom1);
    });

    // 'string' is not supported by design, since string values are used for string primitives!
    test('() => string', () => {
        // custom1 depends on nothing
        const custom1 = customKind.create({ properties: { myProperty: 1 } }).finish().getTypeFinal()!;
        // custom2 depends on custom1, identified by its identifier
        const custom2 = customKind.create({ properties: { dependsOnType: () => custom1.getIdentifier(), myProperty: 2 } }).finish().getTypeFinal()!;
        expect(custom2.properties.dependsOnType?.getType()).toBe(custom1);
    });
    test('() => string (delayed)', () => {
        // custom2 depends on custom1, identified by its identifier, but custom1 does not yet exist
        const custom2 = customKind.create({ properties: { dependsOnType: () => 'custom-1-()', myProperty: 2 } }).finish();
        expect(custom2.getTypeFinal()).toBe(undefined);
        // custom1 depends on nothing
        const custom1 = customKind.create({ properties: { myProperty: 1 } }).finish().getTypeFinal()!;
        // now custom2 is complete
        expect(custom2.getTypeFinal()).toBeTruthy();
        expect(custom2.getTypeFinal()!.properties.dependsOnType?.getType()).toBe(custom1);
    });

    test('TypeInitializer', () => {
        // custom1 depends on nothing
        const initializer1 = customKind.create({ properties: { myProperty: 1 } }).finish();
        const custom1 = initializer1.getTypeFinal()!;
        // custom2 depends on custom1
        const custom2 = customKind.create({ properties: { dependsOnType: initializer1, myProperty: 2 } }).finish().getTypeFinal()!;
        expect(custom2.properties.dependsOnType?.getType()).toBe(custom1);
    });
    test('() => TypeInitializer', () => {
        // custom1 depends on nothing
        const initializer1 = customKind.create({ properties: { myProperty: 1 } }).finish();
        // custom2 depends on custom1
        const custom2 = customKind.create({ properties: { dependsOnType: () => initializer1, myProperty: 2 } }).finish().getTypeFinal()!;
        expect(custom2.properties.dependsOnType?.getType()).toBe((initializer1.getTypeFinal()));
    });

    test('TypeReference', () => {
        // custom1 depends on nothing
        const custom1 = customKind.create({ properties: { myProperty: 1 } }).finish().getTypeFinal()!;
        // custom2 depends on custom1
        const custom2 = customKind.create({ properties: { dependsOnType: custom1, myProperty: 2 } }).finish().getTypeFinal()!;
        expect(custom2.properties.dependsOnType?.getType()).toBe(custom1);
        // custom3 depends on custom1, accessed via the TypeReference of custom2 to custom1
        const custom3 = customKind.create({ properties: { dependsOnType: custom2.properties.dependsOnType, myProperty: 3 } }).finish().getTypeFinal()!;
        expect(custom3.properties.dependsOnType?.getType()).toBe(custom1);
    });
    test('() => TypeReference', () => {
        // custom1 depends on nothing
        const custom1 = customKind.create({ properties: { myProperty: 1 } }).finish().getTypeFinal()!;
        // custom2 depends on custom1
        const custom2 = customKind.create({ properties: { dependsOnType: custom1, myProperty: 2 } }).finish().getTypeFinal()!;
        expect(custom2.properties.dependsOnType?.getType()).toBe(custom1);
        // custom3 depends on custom1, accessed via the TypeReference of custom2 to custom1
        const custom3 = customKind.create({ properties: { dependsOnType: custom2.properties.dependsOnType, myProperty: 3 } }).finish().getTypeFinal()!;
        expect(custom3.properties.dependsOnType?.getType()).toBe(custom1);
    });


    class CustomLiteral extends TestExpressionNode {
        constructor(
            public value: number,
        ) { super(); }
    }
    const literalForTesting = new CustomLiteral(123);

    test('LanguageNode (type inference of TestLanguageNode)', () => {
        // custom1 depends on nothing
        const custom1 = customKind.create({ properties: { myProperty: 1 } })
            .inferenceRule({ matching: node => node === literalForTesting }) // very simple rule, just for testing
            .finish().getTypeFinal()!;
        // custom2 depends on custom1, specified by 'literalForTesting' whose inferred type is used
        const custom2 = customKind.create({ properties: { dependsOnType: literalForTesting, myProperty: 2 } }).finish().getTypeFinal()!;
        expect(custom2.properties.dependsOnType?.getType()).toBe(custom1);
    });
    test('() => LanguageNode (type inference of TestLanguageNode)', () => {
        // custom1 depends on nothing
        const custom1 = customKind.create({ properties: { myProperty: 1 } })
            .inferenceRule({ matching: node => node === literalForTesting }) // very simple rule, just for testing
            .finish().getTypeFinal()!;
        // custom2 depends on custom1, specified by 'literalForTesting' whose inferred type is used
        const custom2 = customKind.create({ properties: { dependsOnType: () => literalForTesting, myProperty: 2 } }).finish().getTypeFinal()!;
        expect(custom2.properties.dependsOnType?.getType()).toBe(custom1);
    });
    test('LanguageNode (type inference of TestLanguageNode) (delayed)', () => {
        // custom2 depends on custom1, specified by 'literalForTesting' whose inferred type is used
        const custom2 = customKind.create({ properties: { dependsOnType: literalForTesting, myProperty: 2 } }).finish();
        expect(custom2.getTypeFinal()).toBe(undefined);
        // custom1 depends on nothing
        const custom1 = customKind.create({ properties: { myProperty: 1 } })
            .inferenceRule({ matching: node => node === literalForTesting }) // very simple rule, just for testing
            .finish().getTypeFinal()!;
        // now, custom2 is complete
        expect(custom2.getTypeFinal).toBeTruthy();
        expect(custom2.getTypeFinal()!.properties.dependsOnType?.getType()).toBe(custom1);
    });

});
