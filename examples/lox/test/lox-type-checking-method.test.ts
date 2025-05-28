/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import {
    assertTrue,
    assertTypirType,
    isClassType,
    isFunctionType,
    isPrimitiveType,
    isType,
} from 'typir';
import { expectTypirTypes } from 'typir/test';
import { describe, expect, test } from 'vitest';
import type { LoxProgram } from '../src/language/generated/ast.js';
import { isMemberCall, isMethodMember } from '../src/language/generated/ast.js';
import {
    loxServices,
    operatorNames,
    validateLox,
} from './lox-type-checking-utils.js';

describe('Test type checking for methods of classes', () => {
    test('Class methods: OK', async () => {
        await validateLox(
            `
            class MyClass1 {
                method1(input: number): number {
                    return 123;
                }
            }
            var v1: MyClass1 = MyClass1();
            var v2: number = v1.method1(456);
        `,
            [],
        );
        expectTypirTypes(loxServices.typir, isClassType, 'MyClass1');
    });

    test('Class methods: wrong return value', async () => {
        await validateLox(
            `
            class MyClass1 {
                method1(input: number): number {
                    return true;
                }
            }
            var v1: MyClass1 = MyClass1();
            var v2: number = v1.method1(456);
        `,
            1,
        );
        expectTypirTypes(loxServices.typir, isClassType, 'MyClass1');
    });

    test('Class methods: method return type does not fit to variable type', async () => {
        await validateLox(
            `
            class MyClass1 {
                method1(input: number): number {
                    return 123;
                }
            }
            var v1: MyClass1 = MyClass1();
            var v2: boolean = v1.method1(456);
        `,
            1,
        );
        expectTypirTypes(loxServices.typir, isClassType, 'MyClass1');
    });

    test('Class methods: value for input parameter does not fit to the type of the input parameter', async () => {
        await validateLox(
            `
            class MyClass1 {
                method1(input: number): number {
                    return 123;
                }
            }
            var v1: MyClass1 = MyClass1();
            var v2: number = v1.method1(true);
        `,
            1,
        );
        expectTypirTypes(loxServices.typir, isClassType, 'MyClass1');
    });

    test('Class methods: methods are not distinguishable', async () => {
        await validateLox(
            `
            class MyClass1 {
                method1(input: number): number {
                    return 123;
                }
                method1(another: number): boolean {
                    return true;
                }
            }
        `,
            [
                // both methods need to be marked:
                'Declared methods need to be unique (class-MyClass1.method1(number)).',
                'Declared methods need to be unique (class-MyClass1.method1(number)).',
            ],
        );
        expectTypirTypes(loxServices.typir, isClassType, 'MyClass1');
    });
});

describe('Test overloaded methods', () => {
    const methodDeclaration = `
        class MyClass {
            method1(input: number): number {
                return 987;
            }
            method1(input: boolean): boolean {
                return true;
            }
        }
    `;

    test('Calls with correct arguments', async () => {
        const rootNode = (
            await validateLox(
                `${methodDeclaration}
            var v = MyClass();
            v.method1(123);
            v.method1(false);
        `,
                [],
            )
        ).parseResult.value as LoxProgram;
        expectTypirTypes(loxServices.typir, isClassType, 'MyClass');
        expectTypirTypes(
            loxServices.typir,
            isFunctionType,
            'method1',
            'method1',
            ...operatorNames,
        );

        // check type inference + cross-reference of the two method calls
        expect(rootNode.elements).toHaveLength(4);

        // Call 1 should be number
        const call1Node = rootNode.elements[2];
        // check cross-reference
        assertTrue(isMemberCall(call1Node));
        const method1 = call1Node.element?.ref;
        assertTrue(isMethodMember(method1));
        expect(method1.returnType.primitive).toBe('number');
        // check type inference
        const call1Type = loxServices.typir.Inference.inferType(call1Node);
        expect(isType(call1Type)).toBeTruthy();
        assertTypirType(call1Type, isPrimitiveType);
        expect(call1Type.getName()).toBe('number');

        // Call 2 should be boolean
        const call2Node = rootNode.elements[3];
        // check cross-reference
        assertTrue(isMemberCall(call2Node));
        const method2 = call2Node.element?.ref;
        assertTrue(isMethodMember(method2));
        expect(method2.returnType.primitive).toBe('boolean');
        // check type inference
        const call2Type = loxServices.typir.Inference.inferType(call2Node);
        expect(isType(call2Type)).toBeTruthy();
        assertTypirType(call2Type, isPrimitiveType);
        expect(call2Type.getName()).toBe('boolean');
    });

    test('Call with wrong argument', async () => {
        await validateLox(
            `${methodDeclaration}
            var v = MyClass();
            v.method1("wrong"); // the linker provides an Method here, but the arguments don't match
        `,
            [
                "The given operands for the call of the overload 'method1' don't match",
            ],
        );
    });
});
