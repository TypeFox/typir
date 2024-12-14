/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { describe, test } from 'vitest';
import { loxServices, validateLox } from './lox-type-checking-utils.js';
import { expectTypirTypes } from '../../../packages/typir/lib/utils/test-utils.js';
import { isClassType } from '../../../packages/typir/lib/kinds/class/class-type.js';

describe('Test type checking for classes', () => {

    test('Class inheritance for assignments: correct', async () => {
        await validateLox(`
            class MyClass1 { name: string age: number }
            class MyClass2 < MyClass1 {}
            var v1: MyClass1 = MyClass2();
        `, 0);
        expectTypirTypes(loxServices.typir, isClassType, 'MyClass1', 'MyClass2');
    });

    test('Class inheritance for assignments: wrong', async () => {
        await validateLox(`
            class MyClass1 { name: string age: number }
            class MyClass2 < MyClass1 {}
            var v1: MyClass2 = MyClass1();
        `, 1);
        expectTypirTypes(loxServices.typir, isClassType, 'MyClass1', 'MyClass2');
    });

    test('Class fields: correct values', async () => {
        await validateLox(`
            class MyClass1 { name: string age: number }
            var v1: MyClass1 = MyClass1();
            v1.name = "Bob";
            v1.age = 42;
        `, 0);
        expectTypirTypes(loxServices.typir, isClassType, 'MyClass1');
    });

    test('Class fields: wrong values', async () => {
        await validateLox(`
            class MyClass1 { name: string age: number }
            var v1: MyClass1 = MyClass1();
            v1.name = 42;
            v1.age = "Bob";
        `, 2);
        expectTypirTypes(loxServices.typir, isClassType, 'MyClass1');
    });

    test('Classes must be unique by name 2', async () => {
        await validateLox(`
            class MyClass1 { }
            class MyClass1 { }
        `, [
            'Declared classes need to be unique (MyClass1).',
            'Declared classes need to be unique (MyClass1).',
        ]);
        expectTypirTypes(loxServices.typir, isClassType, 'MyClass1');
    });

    test('Classes must be unique by name 3', async () => {
        await validateLox(`
            class MyClass2 { }
            class MyClass2 { }
            class MyClass2 { }
        `, [
            'Declared classes need to be unique (MyClass2).',
            'Declared classes need to be unique (MyClass2).',
            'Declared classes need to be unique (MyClass2).',
        ]);
        expectTypirTypes(loxServices.typir, isClassType, 'MyClass2');
    });

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

describe('Class literals', () => {

    test('Class literals 1', async () => {
        await validateLox(`
            class MyClass { name: string age: number }
            var v1 = MyClass(); // constructor call
        `, []);
        expectTypirTypes(loxServices.typir, isClassType, 'MyClass');
    });

    test('Class literals 2', async () => {
        await validateLox(`
            class MyClass { name: string age: number }
            var v1: MyClass = MyClass(); // constructor call
        `, []);
        expectTypirTypes(loxServices.typir, isClassType, 'MyClass');
    });

    test('Class literals 3', async () => {
        await validateLox(`
            class MyClass1 {}
            class MyClass2 {}
            var v1: boolean = MyClass1() == MyClass2(); // comparing objects with each other
        `, [], 1);
        expectTypirTypes(loxServices.typir, isClassType, 'MyClass1', 'MyClass2');
    });

    test('nil is assignable to any Class', async () => {
        await validateLox(`
            class MyClass1 {}
            class MyClass2 {}
            var v1 = MyClass1();
            var v2: MyClass2 = MyClass2();
            v1 = nil;
            v2 = nil;
        `, []);
        expectTypirTypes(loxServices.typir, isClassType, 'MyClass1', 'MyClass2');
    });

});
