/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { beforeEach, describe, expect, test } from 'vitest';
import { CustomTypeInitialization, CustomTypeStorage } from '../../../src/kinds/custom/custom-definitions.js';
import { CustomKind } from '../../../src/kinds/custom/custom-kind.js';
import { PrimitiveType } from '../../../src/kinds/primitive/primitive-type.js';
import { TypirServices } from '../../../src/typir.js';
import { createTypirServicesForTesting, TestingSpecifics } from '../../../src/utils/test-utils.js';

// These test cases test that nesting of properties for custom types is possible (including recursion).

export type NestedProperty = {
    myBool: boolean;
    myType: PrimitiveType;
};


describe('Check that nested properties for custom types work', () => {
    let typir: TypirServices<TestingSpecifics>;
    let integerType: PrimitiveType;

    beforeEach(() => {
        typir = createTypirServicesForTesting();
        integerType = typir.factory.Primitives.create({ primitiveName: 'Integer' }).finish();
    });

    test('Simple nesting', () => {
        type Properties = {
            nested: NestedProperty,
        }

        const customKind = new CustomKind<Properties, TestingSpecifics>(typir, {
            name: 'MyCustom',
            calculateTypeIdentifier: properties => `mycustom-${properties.nested.myBool}-${typir.infrastructure.TypeResolver.resolve(properties.nested.myType).getIdentifier()}`,
            calculateTypeName: properties => `Custom-${typir.infrastructure.TypeResolver.resolve(properties.nested.myType).getName()}`,
        });

        const customType = customKind.create({ properties: { nested: { myBool: true, myType: integerType }} }).finish().getTypeFinal()!;

        expect(customType.getIdentifier()).toBe('mycustom-true-Integer');
        expect(customType.getName()).toBe('Custom-Integer');
        expect(customType.properties.nested.myBool).toBe(true);
        expect(customType.properties.nested.myType.getType()).toBe(integerType);
    });

    test('Deeper simple nesting', () => {
        type Properties = {
            nested: {
                deeper: NestedProperty,
            },
        }

        const customKind = new CustomKind<Properties, TestingSpecifics>(typir, {
            name: 'MyCustom',
            /** Compared with the test case above, this calculation creates the same identifiers, since it does not take the deeper nesting into account.
             * For these independent test cases, this is no problem.
             * But if both kinds are used together in the same Typir instance, the calculation of type identifiers need to be different for both kinds in order to produce unique identifiers.
             */
            calculateTypeIdentifier: properties => `mycustom-${properties.nested.deeper.myBool}-${typir.infrastructure.TypeResolver.resolve(properties.nested.deeper.myType).getIdentifier()}`,
            calculateTypeName: properties => `Custom-${typir.infrastructure.TypeResolver.resolve(properties.nested.deeper.myType).getName()}`,
        });

        const customType = customKind.create({ properties: { nested: { deeper: { myBool: true, myType: integerType } }} }).finish().getTypeFinal()!;

        expect(customType.getIdentifier()).toBe('mycustom-true-Integer');
        expect(customType.getName()).toBe('Custom-Integer');
        expect(customType.properties.nested.deeper.myBool).toBe(true);
        expect(customType.properties.nested.deeper.myType.getType()).toBe(integerType);
    });

    test('Simple grouping with sets, arrays, maps', () => {
        type Properties = {
            mySet: Set<NestedProperty>,
            myArray: NestedProperty[],
            myMap: Map<string, NestedProperty>,
        }

        const customKind = new CustomKind<Properties, TestingSpecifics>(typir, {
            name: 'MyCustom',
            calculateTypeIdentifier: properties => `mycustom-${properties.myArray.map(entry => `${entry.myBool}#${typir.infrastructure.TypeResolver.resolve(entry.myType).getIdentifier()}`).join(',')}`,
            calculateTypeName: properties => `Custom-${properties.myArray.map(entry => `${entry.myBool}#${typir.infrastructure.TypeResolver.resolve(entry.myType).getName()}`).join(',')}`,
        });

        const mapValue: Map<string, NestedProperty> = new Map();
        mapValue.set('hello', { myBool: true, myType: integerType });
        mapValue.set('world', { myBool: false, myType: integerType });

        const customType = customKind.create({ properties: {
            myArray: [{ myBool: true, myType: integerType }, { myBool: false, myType: integerType }],
            mySet: new Set([{ myBool: true, myType: integerType }, { myBool: false, myType: integerType }]),
            myMap: mapValue,
        } }).finish().getTypeFinal()!;

        expect(customType.getIdentifier()).toBe('mycustom-true#Integer,false#Integer');
        expect(customType.getName()).toBe('Custom-true#Integer,false#Integer');

        // set
        expect(customType.properties.mySet.size).toBe(2);
        customType.properties.mySet.forEach(entry => expect(entry.myType.getType()).toBe(integerType));

        // array
        expect(customType.properties.myArray.length).toBe(2);
        expect(customType.properties.myArray[0].myBool).toBe(true);
        expect(customType.properties.myArray[0].myType.getType()).toBe(integerType);
        expect(customType.properties.myArray[1].myBool).toBe(false);
        expect(customType.properties.myArray[1].myType.getType()).toBe(integerType);

        // map
        expect(customType.properties.myMap.size).toBe(2);
        expect(customType.properties.myMap.get('hello')).toBeTruthy();
        expect(customType.properties.myMap.get('hello')!.myBool).toBe(true);
        expect(customType.properties.myMap.get('hello')!.myType.getType()).toBe(integerType);
        expect(customType.properties.myMap.get('world')).toBeTruthy();
        expect(customType.properties.myMap.get('world')!.myBool).toBe(false);
        expect(customType.properties.myMap.get('world')!.myType.getType()).toBe(integerType);
        expect(customType.properties.myMap.get('hello world')).toBeFalsy();
    });

    test('More complex nesting', () => {
        type Properties = {
            myString: string,
            nested: {
                deepArray: NestedProperty[],
                myNumber: number,
            },
        }

        const customKind = new CustomKind<Properties, TestingSpecifics>(typir, {
            name: 'MyCustom',
            calculateTypeIdentifier: properties => `mycustom-${properties.nested.deepArray.map(entry => typir.infrastructure.TypeResolver.resolve(entry.myType).getIdentifier()).join(',')}`,
            calculateTypeName: properties => `Custom-${properties.nested.deepArray.map(entry => typir.infrastructure.TypeResolver.resolve(entry.myType).getName()).join(',')}`,
        });

        const customType = customKind.create({ properties: {
            nested: {
                deepArray: [
                    { myBool: true, myType: integerType },
                    { myBool: false, myType: integerType },
                ],
                myNumber: 123,
            },
            myString: 'hello',
        } }).finish().getTypeFinal()!;

        expect(customType.getIdentifier()).toBe('mycustom-Integer,Integer');
        expect(customType.getName()).toBe('Custom-Integer,Integer');
        customType.properties.nested.deepArray.forEach(entry => expect(entry.myType.getType()).toBe(integerType));
    });

    test('Recursion in properties type', () => {
        type Properties = {
            myContent: NestedProperty,
            myRecursion?: Properties,
        }

        function calculate(properties: CustomTypeInitialization<Properties, TestingSpecifics>, desired: 'Identifier'|'Name'): string {
            const own = desired === 'Identifier'
                ? typir.infrastructure.TypeResolver.resolve(properties.myContent.myType).getIdentifier()
                : typir.infrastructure.TypeResolver.resolve(properties.myContent.myType).getName();
            if (properties.myRecursion) {
                return `${own}-${calculate(properties.myRecursion, desired)}`;
            } else {
                return own;
            }
        }

        const customKind = new CustomKind<Properties, TestingSpecifics>(typir, {
            name: 'MyCustom',
            calculateTypeIdentifier: properties => `mycustom-${calculate(properties, 'Identifier')}`,
            calculateTypeName: properties => `Custom-${calculate(properties, 'Name')}`,
        });

        const customType = customKind.create({ properties: {
            myContent: { myBool: true, myType: integerType },
            myRecursion: {
                myContent: { myBool: false, myType: integerType },
                myRecursion: {
                    myContent: { myBool: true, myType: integerType },
                    // no more entries
                },
            },
        } }).finish().getTypeFinal()!;

        expect(customType.getIdentifier()).toBe('mycustom-Integer-Integer-Integer');
        expect(customType.getName()).toBe('Custom-Integer-Integer-Integer');
        let current: CustomTypeStorage<Properties, TestingSpecifics> | undefined = customType.properties;
        while (current) {
            expect(current.myContent.myType.getType()).toBe(integerType);
            current = current.myRecursion;
        }
    });

});
