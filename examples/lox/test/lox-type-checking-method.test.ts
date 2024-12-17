/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { describe, test } from 'vitest';
import { loxServices, validateLox } from './lox-type-checking-utils.js';
import { expectTypirTypes } from '../../../packages/typir/lib/utils/test-utils.js';
import { isClassType } from '../../../packages/typir/lib/kinds/class/class-type.js';

describe('Test type checking for methods of classes', () => {

    test('Class methods: OK', async () => {
        await validateLox(`
            class MyClass1 {
                method1(input: number): number {
                    return 123;
                }
            }
            var v1: MyClass1 = MyClass1();
            var v2: number = v1.method1(456);
        `, []);
        expectTypirTypes(loxServices.typir, isClassType, 'MyClass1');
    });

    test('Class methods: wrong return value', async () => {
        await validateLox(`
            class MyClass1 {
                method1(input: number): number {
                    return true;
                }
            }
            var v1: MyClass1 = MyClass1();
            var v2: number = v1.method1(456);
        `, 1);
        expectTypirTypes(loxServices.typir, isClassType, 'MyClass1');
    });

    test('Class methods: method return type does not fit to variable type', async () => {
        await validateLox(`
            class MyClass1 {
                method1(input: number): number {
                    return 123;
                }
            }
            var v1: MyClass1 = MyClass1();
            var v2: boolean = v1.method1(456);
        `, 1);
        expectTypirTypes(loxServices.typir, isClassType, 'MyClass1');
    });

    test('Class methods: value for input parameter does not fit to the type of the input parameter', async () => {
        await validateLox(`
            class MyClass1 {
                method1(input: number): number {
                    return 123;
                }
            }
            var v1: MyClass1 = MyClass1();
            var v2: number = v1.method1(true);
        `, 1);
        expectTypirTypes(loxServices.typir, isClassType, 'MyClass1');
    });

    test('Class methods: methods are not distinguishable', async () => {
        await validateLox(`
            class MyClass1 {
                method1(input: number): number {
                    return 123;
                }
                method1(another: number): boolean {
                    return true;
                }
            }
        `, [ // both methods need to be marked:
            'Declared methods need to be unique (class-MyClass1.method1(number)).',
            'Declared methods need to be unique (class-MyClass1.method1(number)).',
        ]);
        expectTypirTypes(loxServices.typir, isClassType, 'MyClass1');
    });

});
