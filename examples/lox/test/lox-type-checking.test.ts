/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { EmptyFileSystem } from 'langium';
import { parseDocument } from 'langium/test';
import { deleteAllDocuments } from 'typir-langium';
import { afterEach, describe, expect, test } from 'vitest';
import type { Diagnostic } from 'vscode-languageserver-types';
import { DiagnosticSeverity } from 'vscode-languageserver-types';
import { isClassType } from '../../../packages/typir/lib/kinds/class-kind.js';
import { isFunctionType } from '../../../packages/typir/lib/kinds/function-kind.js';
import { createLoxServices } from '../src/language/lox-module.js';
import { expectTypirTypes } from '../../../packages/typir/lib/utils/test-utils.js';

const loxServices = createLoxServices(EmptyFileSystem).Lox;
const operatorNames = ['-', '*', '/', '+', '+', '+', '+', '<', '<=', '>', '>=', 'and', 'or', '==', '!=', '=', '!', '-'];

afterEach(async () => {
    await deleteAllDocuments(loxServices);
    // check, that there are no user-defined classes and functions after clearing/invalidating all LOX documents
    expectTypirTypes(loxServices, isClassType);
    expectTypirTypes(loxServices, isFunctionType, ...operatorNames);
});

describe('Explicitly test type checking for LOX', () => {

    test('multiple nested and', async () => {
        await validate('var myResult: boolean = true and false;', 0);
        await validate('var myResult: boolean = true and false and true;', 0);
    });

    test('number assignments', async () => {
        await validate('var myResult: number = 2;', 0);
        await validate('var myResult: number = 2 * 3;', 0);
        await validate('var myResult: number = 2 < 3;', 1);
        await validate('var myResult: number = true;', 1);
    });

    test('boolean assignments', async () => {
        await validate('var myResult: boolean = true;', 0);
        await validate('var myResult: boolean = 2;', 1);
        await validate('var myResult: boolean = 2 * 3;', 1);
        await validate('var myResult: boolean = 2 < 3;', 0);
    });

    test('statement assignments', async () => {
        await validate('var myResult: boolean; myResult = true;', 0);
        await validate('var myResult: boolean; myResult = 2;', 1);
        await validate('var myResult: boolean; myResult = 2 * 3;', 1);
        await validate('var myResult: boolean; myResult = 2 < 3;', 0);
    });

    test('overloaded operator "+"', async () => {
        await validate('var myResult: number = 1 + 2;', 0);
        await validate('var myResult: string = "a" + "b";', 0);
        await validate('var myResult: string = "a" + 2;', 0);
        await validate('var myResult: string = 1 + "b";', 0);
        await validate('var myResult: string = true + "b";', 1);
        await validate('var myResult: string = "a" + false;', 1);
    });

    test('boolean in conditions', async () => {
        await validate('if ( true ) {}', 0);
        await validate('if ( 3 ) {}', 1);
    });

    test('variable declarations', async () => {
        await validate('var myVar : boolean;', 0);
        await validate('var myVar : number;', 0);
        await validate('var myVar : void;', 1);
    });

    test('function: return value and return type must match', async () => {
        await validate('fun myFunction1() : boolean { return true; }', 0);
        await validate('fun myFunction2() : boolean { return 2; }', 1);
        await validate('fun myFunction3() : number { return 2; }', 0);
        await validate('fun myFunction4() : number { return true; }', 1);
        expectTypirTypes(loxServices, isFunctionType, 'myFunction1', 'myFunction2', 'myFunction3', 'myFunction4', ...operatorNames);
    });

    test('overloaded function: different return types are not enough', async () => {
        await validate(`
            fun myFunction() : boolean { return true; }
            fun myFunction() : number { return 2; }
        `, 2);
        expectTypirTypes(loxServices, isFunctionType, 'myFunction', 'myFunction', ...operatorNames); // the types are different nevertheless!
    });
    test('overloaded function: different parameter names are not enough', async () => {
        await validate(`
            fun myFunction(input: boolean) : boolean { return true; }
            fun myFunction(other: boolean) : boolean { return true; }
        `, 2);
        expectTypirTypes(loxServices, isFunctionType, 'myFunction', ...operatorNames); // but both functions have the same type!
    });
    test('overloaded function: but different parameter types are fine', async () => {
        await validate(`
            fun myFunction(input: boolean) : boolean { return true; }
            fun myFunction(input: number) : boolean { return true; }
        `, 0);
        expectTypirTypes(loxServices, isFunctionType, 'myFunction', 'myFunction', ...operatorNames);
    });

    test('use overloaded operators: +', async () => {
        await validate('var myVar : number = 2 + 3;', 0, 0);
        await validate('var myVar : string = "a" + "b";', 0, 0);
        await validate('var myVar : string = "a" + 3;', 0, 0);
        await validate('var myVar : string = 2 + "b";', 0, 0);
    });

    test('use overloaded operators: ==', async () => {
        await validate('var myVar : boolean = true == false;', 0, 0);
        await validate('var myVar : boolean = 2 == 3;', 0, 0);
        await validate('var myVar : boolean = true == 3;', 0, 1);
        await validate('var myVar : boolean = 2 == false;', 0, 1);
    });

    test('Only a single problem with the inner expression, since the type of "+" is always number!', async () => {
        await validate('var myVar : number = 2 + (2 * false);', 1);
    });

    test('Variables without explicit type: assignment', async () => {
        await validate(`
            var min = 14;
            var max = 22;
            max = min;
        `, 0);
    });

    test('Variables without explicit type: assign expression to var without type', async () => {
        await validate(`
            var min = 14;
            var max = 22;
            var sum = min + max;
        `, 0);
    });

    test('Variables without explicit type: assign expression to var with type', async () => {
        await validate(`
            var min = 14;
            var max = 22;
            var sum : number = min + max;
        `, 0);
    });

    test('Variables without explicit type: assign var again with expression of overloaded operator +', async () => {
        await validate(`
            var min = 14;
            var max = 22;
            max = min + max;
        `, 0);
    });

    test('Variables without explicit type: assign var again with expression of overloaded operator -', async () => {
        await validate(`
            var min = 14;
            var max = 22;
            max = min - max;
        `, 0);
    });

    test('Variables without explicit type: assign var again with expression of not overloaded operator *', async () => {
        await validate(`
            var min = 14;
            var max = 22;
            max = min * max;
        `, 0);
    });

    test('Variables without explicit type: used in function', async () => {
        await validate(`
            var min = 14;
            var max = 22;
            var average = (min + max) / 2;
        `, 0);
    });

    describe('Class literals', () => {
        test('Class literals 1', async () => {
            await validate(`
                class MyClass { name: string age: number }
                var v1 = MyClass(); // constructor call
            `, []);
            expectTypirTypes(loxServices, isClassType, 'MyClass');
        });
        test('Class literals 2', async () => {
            await validate(`
                class MyClass { name: string age: number }
                var v1: MyClass = MyClass(); // constructor call
            `, []);
            expectTypirTypes(loxServices, isClassType, 'MyClass');
        });
        test('Class literals 3', async () => {
            await validate(`
                class MyClass1 {}
                class MyClass2 {}
                var v1: boolean = MyClass1() == MyClass2(); // comparing objects with each other
            `, [], 1);
            expectTypirTypes(loxServices, isClassType, 'MyClass1', 'MyClass2');
        });
    });

    test('Class inheritance for assignments: correct', async () => {
        await validate(`
            class MyClass1 { name: string age: number }
            class MyClass2 < MyClass1 {}
            var v1: MyClass1 = MyClass2();
        `, 0);
        expectTypirTypes(loxServices, isClassType, 'MyClass1', 'MyClass2');
    });

    test('Class inheritance for assignments: wrong', async () => {
        await validate(`
            class MyClass1 { name: string age: number }
            class MyClass2 < MyClass1 {}
            var v1: MyClass2 = MyClass1();
        `, 1);
        expectTypirTypes(loxServices, isClassType, 'MyClass1', 'MyClass2');
    });

    test('Class inheritance and the order of type definitions', async () => {
        // the "normal" case: 1st super class, 2nd sub class
        await validate(`
            class MyClass1 {}
            class MyClass2 < MyClass1 {}
        `, []);
        expectTypirTypes(loxServices, isClassType, 'MyClass1', 'MyClass2');
    });
    test('Class inheritance and the order of type definitions', async () => {
        // switching the order of super and sub class works in Langium and in Typir
        await validate(`
            class MyClass2 < MyClass1 {}
            class MyClass1 {}
        `, []);
        expectTypirTypes(loxServices, isClassType, 'MyClass1', 'MyClass2');
    });

    test('Class fields: correct values', async () => {
        await validate(`
            class MyClass1 { name: string age: number }
            var v1: MyClass1 = MyClass1();
            v1.name = "Bob";
            v1.age = 42;
        `, 0);
        expectTypirTypes(loxServices, isClassType, 'MyClass1');
    });

    test('Class fields: wrong values', async () => {
        await validate(`
            class MyClass1 { name: string age: number }
            var v1: MyClass1 = MyClass1();
            v1.name = 42;
            v1.age = "Bob";
        `, 2);
        expectTypirTypes(loxServices, isClassType, 'MyClass1');
    });

    test('Classes must be unique by name 2', async () => {
        await validate(`
            class MyClass1 { }
            class MyClass1 { }
        `, [
            'Declared classes need to be unique (MyClass1).',
            'Declared classes need to be unique (MyClass1).',
        ]);
        expectTypirTypes(loxServices, isClassType, 'MyClass1');
    });

    test('Classes must be unique by name 3', async () => {
        await validate(`
            class MyClass2 { }
            class MyClass2 { }
            class MyClass2 { }
        `, [
            'Declared classes need to be unique (MyClass2).',
            'Declared classes need to be unique (MyClass2).',
            'Declared classes need to be unique (MyClass2).',
        ]);
        expectTypirTypes(loxServices, isClassType, 'MyClass2');
    });

    test('Class methods: OK', async () => {
        await validate(`
            class MyClass1 {
                method1(input: number): number {
                    return 123;
                }
            }
            var v1: MyClass1 = MyClass1();
            var v2: number = v1.method1(456);
        `, []);
        expectTypirTypes(loxServices, isClassType, 'MyClass1');
    });

    test('Class methods: wrong return value', async () => {
        await validate(`
            class MyClass1 {
                method1(input: number): number {
                    return true;
                }
            }
            var v1: MyClass1 = MyClass1();
            var v2: number = v1.method1(456);
        `, 1);
        expectTypirTypes(loxServices, isClassType, 'MyClass1');
    });

    test('Class methods: method return type does not fit to variable type', async () => {
        await validate(`
            class MyClass1 {
                method1(input: number): number {
                    return 123;
                }
            }
            var v1: MyClass1 = MyClass1();
            var v2: boolean = v1.method1(456);
        `, 1);
        expectTypirTypes(loxServices, isClassType, 'MyClass1');
    });

    test('Class methods: value for input parameter does not fit to the type of the input parameter', async () => {
        await validate(`
            class MyClass1 {
                method1(input: number): number {
                    return 123;
                }
            }
            var v1: MyClass1 = MyClass1();
            var v2: number = v1.method1(true);
        `, 1);
        expectTypirTypes(loxServices, isClassType, 'MyClass1');
    });

    test('Class methods: methods are not distinguishable', async () => {
        await validate(`
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
        expectTypirTypes(loxServices, isClassType, 'MyClass1');
    });

});

describe('Cyclic type definitions where a Class is declared and already used', () => {
    test('Class with field of its own type', async () => {
        await validate(`
            class Node {
                children: Node
            }
        `, []);
        expectTypirTypes(loxServices, isClassType, 'Node');
    });

    test('Two Classes with fields with the other Class as type', async () => {
        await validate(`
            class A {
                prop1: B
            }
            class B {
                prop2: A
            }
        `, []);
        expectTypirTypes(loxServices, isClassType, 'A', 'B');
    });

    test('Three Classes with fields with one of the other Classes as type', async () => {
        await validate(`
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
        expectTypirTypes(loxServices, isClassType, 'A', 'B', 'C');
    });

    test('Three Classes with fields with two of the other Classes as type', async () => {
        await validate(`
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
        expectTypirTypes(loxServices, isClassType, 'A', 'B', 'C');
    });

    test('Class with field of its own type and another dependency', async () => {
        await validate(`
            class Node {
                children: Node
                other: Another
            }
            class Another {
                children: Node
            }
        `, []);
        expectTypirTypes(loxServices, isClassType, 'Node', 'Another');
    });

    test('Two Classes with a field of its own type and cyclic dependencies to each other', async () => {
        await validate(`
            class Node {
                own: Node
                other: Another
            }
            class Another {
                own: Another
                another: Node
            }
        `, []);
        expectTypirTypes(loxServices, isClassType, 'Node', 'Another');
    });

    test('Having two declarations for the delayed class A, but only one type A in the type system', async () => {
        await validate(`
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
        expectTypirTypes(loxServices, isClassType, 'A', 'B');
    });

    test('Having three declarations for the delayed class A, but only one type A in the type system', async () => {
        await validate(`
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
        expectTypirTypes(loxServices, isClassType, 'A', 'B');
    });

    test('Having two declarations for class A waiting for B, while B itself depends on A', async () => {
        await validate(`
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
        expectTypirTypes(loxServices, isClassType, 'A', 'B');
    });

    test('Class with method: cycle with return type', async () => {
        await validate(`
            class Node {
                myMethod(input: number): Node {}
            }
        `, []);
        expectTypirTypes(loxServices, isClassType, 'Node');
        expectTypirTypes(loxServices, isFunctionType, 'myMethod', ...operatorNames);
    });

    test('Class with method: cycle with input parameter type', async () => {
        await validate(`
            class Node {
                myMethod(input: Node): number {}
            }
        `, []);
        expectTypirTypes(loxServices, isClassType, 'Node');
        expectTypirTypes(loxServices, isFunctionType, 'myMethod', ...operatorNames);
    });

    test('Two different Classes with the same method (type) should result in only one method type', async () => {
        await validate(`
            class A {
                prop1: boolean
                myMethod(input: number): boolean {}
            }
            class B {
                prop1: number
                myMethod(input: number): boolean {}
            }
        `, []);
        expectTypirTypes(loxServices, isClassType, 'A', 'B');
        expectTypirTypes(loxServices, isFunctionType, 'myMethod', ...operatorNames);
    });

    test('Two different Classes depend on each other regarding their methods return type', async () => {
        await validate(`
            class A {
                prop1: boolean
                myMethod(input: number): B {}
            }
            class B {
                prop1: number
                myMethod(input: number): A {}
            }
        `, []);
        expectTypirTypes(loxServices, isClassType, 'A', 'B');
        expectTypirTypes(loxServices, isFunctionType, 'myMethod', 'myMethod', ...operatorNames);
    });

    test('Two different Classes with the same method which has one of these classes as return type', async () => {
        await validate(`
            class A {
                prop1: boolean
                myMethod(input: number): B {}
            }
            class B {
                prop1: number
                myMethod(input: number): B {}
            }
        `, []);
        expectTypirTypes(loxServices, isClassType, 'A', 'B');
        expectTypirTypes(loxServices, isFunctionType, 'myMethod', ...operatorNames);
    });

    test('Same delayed function type is used by a function declaration and a method declaration', async () => {
        await validate(`
            class A {
                myMethod(input: number): B {}
            }
            fun myMethod(input: number): B {}
            class B { }
        `, []);
        expectTypirTypes(loxServices, isClassType, 'A', 'B');
        expectTypirTypes(loxServices, isFunctionType, 'myMethod', ...operatorNames);
    });

    test('Two class declarations A with the same delayed method which depends on the class B', async () => {
        await validate(`
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
        expectTypirTypes(loxServices, isClassType, 'A', 'B');
        expectTypirTypes(loxServices, isFunctionType, 'myMethod', ...operatorNames);
    });

    test('Mix of dependencies in classes: 1 method and 1 field', async () => {
        await validate(`
            class A {
                myMethod(input: number): B1 {}
            }
            class B1 {
                propB1: A
            }
        `, []);
        expectTypirTypes(loxServices, isClassType, 'A', 'B1');
        expectTypirTypes(loxServices, isFunctionType, 'myMethod', ...operatorNames);
    });

    test('Mix of dependencies in classes: 1 method and 2 fields (order 1)', async () => {
        await validate(`
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
        expectTypirTypes(loxServices, isClassType, 'A', 'B1', 'B2');
        expectTypirTypes(loxServices, isFunctionType, 'myMethod', ...operatorNames);
    });

    test('Mix of dependencies in classes: 1 method and 2 fields (order 2)', async () => {
        await validate(`
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
        expectTypirTypes(loxServices, isClassType, 'A', 'B1', 'B2');
        expectTypirTypes(loxServices, isFunctionType, 'myMethod', ...operatorNames);
    });

    test('The same class is involved into two dependency cycles', async () => {
        await validate(`
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
        expectTypirTypes(loxServices, isClassType, 'A', 'B1', 'B2', 'C1', 'C2');
        expectTypirTypes(loxServices, isFunctionType, 'myMethod', 'methodC1', 'methodC2', ...operatorNames);
    });

});

describe('Test internal validation of Typir for cycles in the class inheritance hierarchy', () => {
    test('Three involved classes: 1 -> 2 -> 3 -> 1', async () => {
        await validate(`
            class MyClass1 < MyClass3 { }
            class MyClass2 < MyClass1 { }
            class MyClass3 < MyClass2 { }
        `, [
            'Cycles in super-sub-class-relationships are not allowed: MyClass1',
            'Cycles in super-sub-class-relationships are not allowed: MyClass2',
            'Cycles in super-sub-class-relationships are not allowed: MyClass3',
        ]);
        expectTypirTypes(loxServices, isClassType, 'MyClass1', 'MyClass2', 'MyClass3');
    });

    test('Two involved classes: 1 -> 2 -> 1', async () => {
        await validate(`
            class MyClass1 < MyClass2 { }
            class MyClass2 < MyClass1 { }
        `, [
            'Cycles in super-sub-class-relationships are not allowed: MyClass1',
            'Cycles in super-sub-class-relationships are not allowed: MyClass2',
        ]);
        expectTypirTypes(loxServices, isClassType, 'MyClass1', 'MyClass2');
    });

    test('One involved class: 1 -> 1', async () => {
        await validate(`
            class MyClass1 < MyClass1 { }
        `, 'Cycles in super-sub-class-relationships are not allowed: MyClass1');
        expectTypirTypes(loxServices, isClassType, 'MyClass1');
    });
});

describe('longer LOX examples', () => {
    // this test case will work after having the support for cyclic type definitions, since it will solve also issues with topological order of type definitions
    test('complete with difficult order of classes', async () => {
        await validate(`
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
        expectTypirTypes(loxServices, isClassType, 'SuperClass', 'SubClass', 'NestedClass');
    });

    test('complete with easy order of classes', async () => {
        await validate(`
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
        expectTypirTypes(loxServices, isClassType, 'SuperClass', 'SubClass', 'NestedClass');
    });
});

async function validate(lox: string, errors: number | string | string[], warnings: number = 0) {
    const document = await parseDocument(loxServices, lox.trim());
    const diagnostics: Diagnostic[] = await loxServices.validation.DocumentValidator.validateDocument(document);

    // errors
    const diagnosticsErrors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error).map(d => fixMessage(d.message));
    const msgError = diagnosticsErrors.join('\n');
    if (typeof errors === 'number') {
        expect(diagnosticsErrors, msgError).toHaveLength(errors);
    } else if (typeof errors === 'string') {
        expect(diagnosticsErrors, msgError).toHaveLength(1);
        expect(diagnosticsErrors[0]).toBe(errors);
    } else {
        expect(diagnosticsErrors, msgError).toHaveLength(errors.length);
        for (const expected of errors) {
            expect(diagnosticsErrors).includes(expected);
        }
    }

    // warnings
    const diagnosticsWarnings = diagnostics.filter(d => d.severity === DiagnosticSeverity.Warning).map(d => fixMessage(d.message));
    const msgWarning = diagnosticsWarnings.join('\n');
    expect(diagnosticsWarnings, msgWarning).toHaveLength(warnings);
}

function fixMessage(msg: string): string {
    if (msg.startsWith('While validating the AstNode')) {
        const inbetween = 'this error is found: ';
        return msg.substring(msg.indexOf(inbetween) + inbetween.length);
    }
    return msg;
}
