/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { beforeEach, describe, expect, test } from 'vitest';
import { Type } from '../../../src/graph/type-node.js';
import { TypeInitializer } from '../../../src/initialization/type-initializer.js';
import { TypeReference } from '../../../src/initialization/type-reference.js';
import { CustomKind } from '../../../src/kinds/custom/custom-kind.js';
import { isCustomType } from '../../../src/kinds/custom/custom-type.js';
import { PrimitiveType } from '../../../src/kinds/primitive/primitive-type.js';
import { TestingSpecifics, createTypirServicesForTesting } from '../../../src/test/predefined-language-nodes.js';
import { TypirServices } from '../../../src/typir.js';
import { expectToBeType } from '../../../src/test/test-utils.js';

// These test cases test, that custom types might depend on other types including custom types
// and the creation of custom types is delayed, when those types are not yet existing.

export type MyCustomType = {
    dependsOnType: Type;
    myProperty: number;
};


describe('Check custom types depending on other types', () => {
    let typir: TypirServices<TestingSpecifics>;
    let integerType: PrimitiveType;
    let customKind: CustomKind<MyCustomType, TestingSpecifics>;

    beforeEach(() => {
        typir = createTypirServicesForTesting();

        integerType = typir.factory.Primitives.create({ primitiveName: 'Integer' }).finish();

        customKind = new CustomKind<MyCustomType, TestingSpecifics>(typir, {
            name: 'MyCustom',
            // determine which identifier is used to store and retrieve a custom type in the type graph (and to check its uniqueness)
            calculateTypeIdentifier: properties =>
                `custom-mycustom-${typir.infrastructure.TypeResolver.resolve(properties.dependsOnType).getIdentifier()}-${properties.myProperty}`,
        });
    });

    test('Custom types depend on other custom types: in nice order', () => {
        // custom1 depends on integer
        const config1 = customKind.create({ typeName: 'C1', properties: { dependsOnType: integerType, myProperty: 1 } }).finish();
        const custom1 = config1.getTypeFinal();
        expectToBeType(custom1, type => isCustomType(type, customKind), type => type.properties.myProperty === 1 && type.properties.dependsOnType.getType() === integerType);

        // custom2 depends on custom1
        const config2 = customKind.create({ typeName: 'C2', properties: { dependsOnType: custom1, myProperty: 2 } }).finish();
        const custom2 = config2.getTypeFinal();
        expectToBeType(custom2, type => isCustomType(type, customKind), type => type.properties.myProperty === 2 && type.properties.dependsOnType.getType() === custom1);

        // custom3 depends on custom2
        const config3 = customKind.create({ typeName: 'C3', properties: { dependsOnType: custom2, myProperty: 3 } }).finish();
        const custom3 = config3.getTypeFinal();
        expectToBeType(custom3, type => isCustomType(type, customKind), type => type.properties.myProperty === 3 && type.properties.dependsOnType.getType() === custom2);
    });

    test('Custom types depend on other custom types: in difficult order', () => {
        // custom2 depends on custom1, which is not defined yet
        const config2 = customKind.create({ typeName: 'C2', properties: {
            dependsOnType: customKind.get({ dependsOnType: integerType, myProperty: 1 }) as unknown as TypeReference<Type, TestingSpecifics>,
            myProperty: 2 } }).finish();
        let custom2 = config2.getTypeFinal();
        expect(custom2).toBeUndefined();

        // custom1 depends on integer => directly available
        const config1 = customKind.create({ typeName: 'C1', properties: { dependsOnType: integerType, myProperty: 1 } }).finish();
        const custom1 = config1.getTypeFinal();
        expectToBeType(custom1, type => isCustomType(type, customKind), type => type.properties.myProperty === 1 && type.properties.dependsOnType.getType() === integerType);

        // since custom1 is available now, custom2 is available as well
        custom2 = config2.getTypeFinal();
        expectToBeType(custom2, type => isCustomType(type, customKind), type => type.properties.myProperty === 2 && type.properties.dependsOnType.getType() === custom1);

        // custom3 depends on custom2
        const config3 = customKind.create({ typeName: 'C3', properties: { dependsOnType: custom2, myProperty: 3 } }).finish();
        const custom3 = config3.getTypeFinal();
        expectToBeType(custom3, type => isCustomType(type, customKind), type => type.properties.myProperty === 3 && type.properties.dependsOnType.getType() === custom2);
    });

    test('Custom types depend on other custom types: in difficult order, transitive', () => {
        // custom2 depends on custom1, which is not defined yet
        const config2 = customKind.create({ typeName: 'C2', properties: {
            dependsOnType: customKind.get({ dependsOnType: integerType, myProperty: 1 })  as unknown as TypeReference<Type, TestingSpecifics>,
            myProperty: 2 } }).finish();
        let custom2 = config2.getTypeFinal();
        expect(custom2).toBeUndefined();

        // custom3 depends on custom2
        const config3 = customKind.create({ typeName: 'C3', properties: { dependsOnType: config2 as unknown as TypeInitializer<Type, TestingSpecifics>, myProperty: 3 } }).finish();
        let custom3 = config3.getTypeFinal();
        expect(custom3).toBeUndefined();

        // custom1 depends on integer => directly available
        const config1 = customKind.create({ typeName: 'C1', properties: { dependsOnType: integerType, myProperty: 1 } }).finish();
        const custom1 = config1.getTypeFinal();
        expectToBeType(custom1, type => isCustomType(type, customKind), type => type.properties.myProperty === 1 && type.properties.dependsOnType.getType() === integerType);

        // since custom1 is available now, custom2 and custom3 are available as well
        custom2 = config2.getTypeFinal();
        expectToBeType(custom2, type => isCustomType(type, customKind), type => type.properties.myProperty === 2 && type.properties.dependsOnType.getType() === custom1);
        custom3 = config3.getTypeFinal();
        expectToBeType(custom3, type => isCustomType(type, customKind), type => type.properties.myProperty === 3 && type.properties.dependsOnType.getType() === custom2);
    });

});
