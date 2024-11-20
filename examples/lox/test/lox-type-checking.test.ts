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

afterEach(async () => {
    await deleteAllDocuments(loxServices);
    // check, that there are no user-defined classes and functions after clearing/invalidating all LOX documents
    expectTypirTypes(loxServices, isClassType);
    expectTypirTypes(loxServices, isFunctionType, '-', '*', '/', '+', '+', '+', '+', '<', '<=', '>', '>=', 'and', 'or', '==', '!=', '=', '!', '-');
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
    });

    test('overloaded function: different return types are not enough', async () => {
        await validate(`
            fun myFunction() : boolean { return true; }
            fun myFunction() : number { return 2; }
        `, 2);
    });
    test('overloaded function: different parameter names are not enough', async () => {
        await validate(`
            fun myFunction(input: boolean) : boolean { return true; }
            fun myFunction(other: boolean) : boolean { return true; }
        `, 2);
    });
    test('overloaded function: but different parameter types are fine', async () => {
        await validate(`
            fun myFunction(input: boolean) : boolean { return true; }
            fun myFunction(input: number) : boolean { return true; }
        `, 0);
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
        });
        test('Class literals 2', async () => {
            await validate(`
                class MyClass { name: string age: number }
                var v1: MyClass = MyClass(); // constructor call
            `, []);
        });
        test('Class literals 3', async () => {
            await validate(`
                class MyClass1 {}
                class MyClass2 {}
                var v1: boolean = MyClass1() == MyClass2(); // comparing objects with each other
            `, [], 1);
        });
    });

    test('Class inheritance for assignments', async () => {
        await validate(`
            class MyClass1 { name: string age: number }
            class MyClass2 < MyClass1 {}
            var v1: MyClass1 = MyClass2();
        `, 0);
        await validate(`
            class MyClass1 { name: string age: number }
            class MyClass2 < MyClass1 {}
            var v1: MyClass2 = MyClass1();
        `, 1);
    });

    test('Class inheritance and the order of type definitions', async () => {
        // the "normal" case: 1st super class, 2nd sub class
        await validate(`
            class MyClass1 {}
            class MyClass2 < MyClass1 {}
        `, []);
    });
    test('Class inheritance and the order of type definitions', async () => {
        // switching the order of super and sub class works in Langium and in Typir
        await validate(`
            class MyClass2 < MyClass1 {}
            class MyClass1 {}
        `, []);
    });

    test('Class fields', async () => {
        await validate(`
            class MyClass1 { name: string age: number }
            var v1: MyClass1 = MyClass1();
            v1.name = "Bob";
            v1.age = 42;
        `, 0);
        await validate(`
            class MyClass1 { name: string age: number }
            var v1: MyClass1 = MyClass1();
            v1.name = 42;
            v1.age = "Bob";
        `, 2);
    });

    test('Classes must be unique by name', async () => {
        await validate(`
            class MyClass1 { }
            class MyClass1 { }
        `, [
            'Declared classes need to be unique (MyClass1).',
            'Declared classes need to be unique (MyClass1).',
        ]);
        await validate(`
            class MyClass2 { }
            class MyClass2 { }
            class MyClass2 { }
        `, [
            'Declared classes need to be unique (MyClass2).',
            'Declared classes need to be unique (MyClass2).',
            'Declared classes need to be unique (MyClass2).',
        ]);
    });

    test('Class methods: OK', async () => await validate(`
        class MyClass1 {
            method1(input: number): number {
                return 123;
            }
        }
        var v1: MyClass1 = MyClass1();
        var v2: number = v1.method1(456);
    `, []));

    test('Class methods: wrong return value', async () => await validate(`
        class MyClass1 {
            method1(input: number): number {
                return true;
            }
        }
        var v1: MyClass1 = MyClass1();
        var v2: number = v1.method1(456);
    `, 1));

    test('Class methods: method return type does not fit to variable type', async () => await validate(`
        class MyClass1 {
            method1(input: number): number {
                return 123;
            }
        }
        var v1: MyClass1 = MyClass1();
        var v2: boolean = v1.method1(456);
    `, 1));

    test('Class methods: value for input parameter does not fit to the type of the input parameter', async () => await validate(`
        class MyClass1 {
            method1(input: number): number {
                return 123;
            }
        }
        var v1: MyClass1 = MyClass1();
        var v2: number = v1.method1(true);
    `, 1));

    test('Class methods: methods are not distinguishable', async () => await validate(`
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
    ]));

});

describe('Cyclic type definitions where a Class is declared and already used', () => {
    test('Class with field', async () => {
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

    test('Three Classes with fields with the other Class as type', async () => {
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

    test.todo('Class with method', async () => {
        await validate(`
            class Node {
                myMethod(input: number): Node {}
            }
        `, []);
        expectTypirTypes(loxServices, isClassType, 'Node');
        expectTypirTypes(loxServices, isFunctionType, 'myMethod');
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

});

describe('Test internal validation of Typir for cycles in the class inheritance hierarchy', () => {
    test('Three involved classes: 1 -> 2 -> 3 -> 1', async () => {
        await validate(`
            class MyClass1 < MyClass3 { }
            class MyClass2 < MyClass1 { }
            class MyClass3 < MyClass2 { }
        `, [
            'Circles in super-sub-class-relationships are not allowed: MyClass1',
            'Circles in super-sub-class-relationships are not allowed: MyClass2',
            'Circles in super-sub-class-relationships are not allowed: MyClass3',
        ]);
        expectTypirTypes(loxServices, isClassType, 'MyClass1', 'MyClass2', 'MyClass3');
    });

    test('Two involved classes: 1 -> 2 -> 1', async () => {
        await validate(`
            class MyClass1 < MyClass2 { }
            class MyClass2 < MyClass1 { }
        `, [
            'Circles in super-sub-class-relationships are not allowed: MyClass1',
            'Circles in super-sub-class-relationships are not allowed: MyClass2',
        ]);
        expectTypirTypes(loxServices, isClassType, 'MyClass1', 'MyClass2');
    });

    test('One involved class: 1 -> 1', async () => {
        await validate(`
            class MyClass1 < MyClass1 { }
        `, 'Circles in super-sub-class-relationships are not allowed: MyClass1');
        expectTypirTypes(loxServices, isClassType, 'MyClass1');
    });
});

describe('longer LOX examples', () => {
    // this test case will work after having the support for cyclic type definitions, since it will solve also issues with topological order of type definitions
    test('complete with difficult order of classes', async () => await validate(`
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
    `, []));

    test('complete with easy order of classes', async () => await validate(`
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
    `, []));
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
