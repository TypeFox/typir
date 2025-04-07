/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { isClassType, isFunctionType } from 'typir';
import { expectTypirTypes } from 'typir/test';
import { describe, test } from 'vitest';
import { loxServices, operatorNames, validateLox } from './lox-type-checking-utils.js';

describe('Cyclic type definitions where a Class is declared and already used', () => {
    test('Class with field of its own type', async () => {
        await validateLox(`
            class Node {
                children: Node
            }
        `, []);
        expectTypirTypes(loxServices.typir, isClassType, 'Node');
    });

    test('Two Classes with fields with the other Class as type', async () => {
        await validateLox(`
            class A {
                prop1: B
            }
            class B {
                prop2: A
            }
        `, []);
        expectTypirTypes(loxServices.typir, isClassType, 'A', 'B');
    });

    test('Three Classes with fields with one of the other Classes as type', async () => {
        await validateLox(`
            class A {
                prop1: B
            }
            class B {
                prop2: C
            }
            class C {
                prop3: A
            }
        `, []);
        expectTypirTypes(loxServices.typir, isClassType, 'A', 'B', 'C');
    });

    test('Three Classes with fields with two of the other Classes as type', async () => {
        await validateLox(`
            class A {
                prop1: B
                prop2: C
            }
            class B {
                prop3: C
                prop4: A
            }
            class C {
                prop5: A
                prop6: B
            }
        `, []);
        expectTypirTypes(loxServices.typir, isClassType, 'A', 'B', 'C');
    });

    test('Class with field of its own type and another dependency', async () => {
        await validateLox(`
            class Node {
                children: Node
                other: Another
            }
            class Another {
                children: Node
            }
        `, []);
        expectTypirTypes(loxServices.typir, isClassType, 'Node', 'Another');
    });

    test('Two Classes with a field of its own type and cyclic dependencies to each other', async () => {
        await validateLox(`
            class Node {
                own: Node
                other: Another
            }
            class Another {
                own: Another
                another: Node
            }
        `, []);
        expectTypirTypes(loxServices.typir, isClassType, 'Node', 'Another');
    });

    test('Having two declarations for the delayed class A, but only one type A in the type system', async () => {
        await validateLox(`
            class A {
                property1: B // needs to wait for B, since B is defined below
            }
            class A {
                property2: B // needs to wait for B, since B is defined below
            }
            class B { }
        `, [ // Typir works with this, but for LOX these validation errors are produced:
            'Declared classes need to be unique (A).',
            'Declared classes need to be unique (A).',
        ]);
        // check, that there is only one class type A in the type graph:
        expectTypirTypes(loxServices.typir, isClassType, 'A', 'B');
    });

    test('Having three declarations for the delayed class A, but only one type A in the type system', async () => {
        await validateLox(`
            class A {
                property1: B // needs to wait for B, since B is defined below
            }
            class A {
                property2: B // needs to wait for B, since B is defined below
            }
            class A {
                property3: B // needs to wait for B, since B is defined below
            }
            class B { }
        `, [ // Typir works with this, but for LOX these validation errors are produced:
            'Declared classes need to be unique (A).',
            'Declared classes need to be unique (A).',
            'Declared classes need to be unique (A).',
        ]);
        // check, that there is only one class type A in the type graph:
        expectTypirTypes(loxServices.typir, isClassType, 'A', 'B');
    });

    test('Having two declarations for class A waiting for B, while B itself depends on A', async () => {
        await validateLox(`
            class A {
                property1: B // needs to wait for B, since B is defined below
            }
            class A {
                property2: B // needs to wait for B, since B is defined below
            }
            class B {
                property3: A // should be the valid A and not the invalid A
            }
        `, [ // Typir works with this, but for LOX these validation errors are produced:
            'Declared classes need to be unique (A).',
            'Declared classes need to be unique (A).',
        ]);
        // check, that there is only one class type A in the type graph:
        expectTypirTypes(loxServices.typir, isClassType, 'A', 'B');
    });

    test('Class with method: cycle with return type', async () => {
        await validateLox(`
            class Node {
                myMethod(input: number): Node {}
            }
        `, []);
        expectTypirTypes(loxServices.typir, isClassType, 'Node');
        expectTypirTypes(loxServices.typir, isFunctionType, 'myMethod', ...operatorNames);
    });

    test('Class with method: cycle with input parameter type', async () => {
        await validateLox(`
            class Node {
                myMethod(input: Node): number {}
            }
        `, []);
        expectTypirTypes(loxServices.typir, isClassType, 'Node');
        expectTypirTypes(loxServices.typir, isFunctionType, 'myMethod', ...operatorNames);
    });

    test('Two different Classes with the same method (type) should result in only one method type', async () => {
        await validateLox(`
            class A {
                prop1: boolean
                myMethod(input: number): boolean {}
            }
            class B {
                prop1: number
                myMethod(input: number): boolean {}
            }
        `, []);
        expectTypirTypes(loxServices.typir, isClassType, 'A', 'B');
        expectTypirTypes(loxServices.typir, isFunctionType, 'myMethod', ...operatorNames);
    });

    test('Two different Classes depend on each other regarding their methods return type', async () => {
        await validateLox(`
            class A {
                prop1: boolean
                myMethod(input: number): B {}
            }
            class B {
                prop1: number
                myMethod(input: number): A {}
            }
        `, []);
        expectTypirTypes(loxServices.typir, isClassType, 'A', 'B');
        expectTypirTypes(loxServices.typir, isFunctionType, 'myMethod', 'myMethod', ...operatorNames);
    });

    test('Two different Classes with the same method which has one of these classes as return type', async () => {
        await validateLox(`
            class A {
                prop1: boolean
                myMethod(input: number): B {}
            }
            class B {
                prop1: number
                myMethod(input: number): B {}
            }
        `, []);
        expectTypirTypes(loxServices.typir, isClassType, 'A', 'B');
        expectTypirTypes(loxServices.typir, isFunctionType, 'myMethod', ...operatorNames);
    });

    test('Same delayed function type is used by a function declaration and a method declaration', async () => {
        await validateLox(`
            class A {
                myMethod(input: number): B {}
            }
            fun myMethod(input: number): B {}
            class B { }
        `, []);
        expectTypirTypes(loxServices.typir, isClassType, 'A', 'B');
        expectTypirTypes(loxServices.typir, isFunctionType, 'myMethod', ...operatorNames);
    });

    test('Two class declarations A with the same delayed method which depends on the class B', async () => {
        await validateLox(`
            class A {
                myMethod(input: number): B {}
            }
            class A {
                myMethod(input: number): B {}
            }
            class B { }
        `, [ // Typir works with this, but for LOX these validation errors are produced:
            'Declared classes need to be unique (A).',
            'Declared classes need to be unique (A).',
        ]);
        // check, that there is only one class type A in the type graph:
        expectTypirTypes(loxServices.typir, isClassType, 'A', 'B');
        expectTypirTypes(loxServices.typir, isFunctionType, 'myMethod', ...operatorNames);
    });

    test('Mix of dependencies in classes: 1 method and 1 field', async () => {
        await validateLox(`
            class A {
                myMethod(input: number): B1 {}
            }
            class B1 {
                propB1: A
            }
        `, []);
        expectTypirTypes(loxServices.typir, isClassType, 'A', 'B1');
        expectTypirTypes(loxServices.typir, isFunctionType, 'myMethod', ...operatorNames);
    });

    test('Mix of dependencies in classes: 1 method and 2 fields (order 1)', async () => {
        await validateLox(`
            class B1 {
                propB1: B2
            }
            class B2 {
                propB1: A
            }
            class A {
                myMethod(input: number): B1 {}
            }
        `, []);
        expectTypirTypes(loxServices.typir, isClassType, 'A', 'B1', 'B2');
        expectTypirTypes(loxServices.typir, isFunctionType, 'myMethod', ...operatorNames);
    });

    test('Mix of dependencies in classes: 1 method and 2 fields (order 2)', async () => {
        await validateLox(`
            class A {
                myMethod(input: number): B1 {}
            }
            class B1 {
                propB1: B2
            }
            class B2 {
                propB1: A
            }
        `, []);
        expectTypirTypes(loxServices.typir, isClassType, 'A', 'B1', 'B2');
        expectTypirTypes(loxServices.typir, isFunctionType, 'myMethod', ...operatorNames);
    });

    test('The same class is involved into two dependency cycles', async () => {
        await validateLox(`
            class A {
                probA: C1
                myMethod(input: number): B1 {}
            }
            class B1 {
                propB1: B2
            }
            class B2 {
                propB1: A
            }
            class C1 {
                methodC1(p: C2): void {}
            }
            class C2 {
                methodC2(p: A): void {}
            }
        `, []);
        expectTypirTypes(loxServices.typir, isClassType, 'A', 'B1', 'B2', 'C1', 'C2');
        expectTypirTypes(loxServices.typir, isFunctionType, 'myMethod', 'methodC1', 'methodC2', ...operatorNames);
    });

    test('Class inheritance and the order of type definitions', async () => {
        // the "normal" case: 1st super class, 2nd sub class
        await validateLox(`
            class MyClass1 {}
            class MyClass2 < MyClass1 {}
        `, []);
        expectTypirTypes(loxServices.typir, isClassType, 'MyClass1', 'MyClass2');
    });

    test('Class inheritance and the order of type definitions', async () => {
        // switching the order of super and sub class works in Langium and in Typir
        await validateLox(`
            class MyClass2 < MyClass1 {}
            class MyClass1 {}
        `, []);
        expectTypirTypes(loxServices.typir, isClassType, 'MyClass1', 'MyClass2');
    });
});

describe('Test internal validation of Typir for cycles in the class inheritance hierarchy', () => {
    test('Three involved classes: 1 -> 2 -> 3 -> 1', async () => {
        await validateLox(`
            class MyClass1 < MyClass3 { }
            class MyClass2 < MyClass1 { }
            class MyClass3 < MyClass2 { }
        `, [
            'Cycles in super-sub-class-relationships are not allowed: MyClass1',
            'Cycles in super-sub-class-relationships are not allowed: MyClass2',
            'Cycles in super-sub-class-relationships are not allowed: MyClass3',
        ]);
        expectTypirTypes(loxServices.typir, isClassType, 'MyClass1', 'MyClass2', 'MyClass3');
    });

    test('Two involved classes: 1 -> 2 -> 1', async () => {
        await validateLox(`
            class MyClass1 < MyClass2 { }
            class MyClass2 < MyClass1 { }
        `, [
            'Cycles in super-sub-class-relationships are not allowed: MyClass1',
            'Cycles in super-sub-class-relationships are not allowed: MyClass2',
        ]);
        expectTypirTypes(loxServices.typir, isClassType, 'MyClass1', 'MyClass2');
    });

    test('One involved class: 1 -> 1', async () => {
        await validateLox(`
            class MyClass1 < MyClass1 { }
        `, 'Cycles in super-sub-class-relationships are not allowed: MyClass1');
        expectTypirTypes(loxServices.typir, isClassType, 'MyClass1');
    });
});

describe('longer LOX examples with classes regarding ordering', () => {
    // this test case will work after having the support for cyclic type definitions, since it will solve also issues with topological order of type definitions
    test('complete with difficult order of classes', async () => {
        await validateLox(`
            class SuperClass {
                a: number
            }

            class SubClass < SuperClass {
                // Nested class
                nested: NestedClass
            }

            class NestedClass {
                field: string
                method(): string {
                    return "execute this";
                }
            }

            // Constructor call
            var x = SubClass();
            // Assigning nil to a class type
            var nilTest = SubClass();
            nilTest = nil;

            // Accessing members of a class
            var value = x.nested.method() + "wasd";
            print value;

            // Accessing members of a super class
            var superValue = x.a;
            print superValue;

            // Assigning a subclass to a super class
            var superType: SuperClass = x;
            print superType.a;
        `, []);
        expectTypirTypes(loxServices.typir, isClassType, 'SuperClass', 'SubClass', 'NestedClass');
    });

    test('complete with easy order of classes', async () => {
        await validateLox(`
            class SuperClass {
                a: number
            }

            class NestedClass {
                field: string
                method(): string {
                    return "execute this";
                }
            }

            class SubClass < SuperClass {
                // Nested class
                nested: NestedClass
            }


            // Constructor call
            var x = SubClass();
            // Assigning nil to a class type
            var nilTest = SubClass();
            nilTest = nil;

            // Accessing members of a class
            var value = x.nested.method() + "wasd";
            print value;

            // Accessing members of a super class
            var superValue = x.a;
            print superValue;

            // Assigning a subclass to a super class
            var superType: SuperClass = x;
            print superType.a;
        `, []);
        expectTypirTypes(loxServices.typir, isClassType, 'SuperClass', 'SubClass', 'NestedClass');
    });
});
