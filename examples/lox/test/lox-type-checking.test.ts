/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { EmptyFileSystem } from 'langium';
import { parseDocument } from 'langium/test';
import { describe, expect, test } from 'vitest';
import type { Diagnostic } from 'vscode-languageserver-types';
import { DiagnosticSeverity } from 'vscode-languageserver-types';
import { createLoxServices } from '../src/language/lox-module.js';

const loxServices = createLoxServices(EmptyFileSystem).Lox;

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

    test('boolean in conditions', async () => {
        await validate('if ( true ) {}', 0);
        await validate('if ( 3 ) {}', 1);
    });

    test('variable declarations', async () => {
        await validate('var myVar : boolean;', 0);
        await validate('var myVar : number;', 0);
        await validate('var myVar : void;', 1);
    });

    test('function: return value and return type', async () => {
        await validate('fun myFunction() : boolean { return true; }', 0);
        await validate('fun myFunction() : boolean { return 2; }', 1);
        await validate('fun myFunction() : number { return 2; }', 0);
        await validate('fun myFunction() : number { return true; }', 1);
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

    test('Class literals', async () => {
        await validate(`
            class MyClass { name: string age: number }
            var v1 = MyClass(); // constructor call
        `, 0);
        await validate(`
            class MyClass { name: string age: number }
            var v1: MyClass = MyClass(); // constructor call
        `, 0);
        await validate(`
            class MyClass1 {}
            class MyClass2 {}
            var v1: boolean = MyClass1() == MyClass2(); // comparing objects with each other
        `, 0, 1);
    });

    test('Class inheritance', async () => {
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

});

async function validate(lox: string, errors: number, warnings: number = 0) {
    const document = await parseDocument(loxServices, lox.trim());
    const diagnostics: Diagnostic[] = await loxServices.validation.DocumentValidator.validateDocument(document);
    // errors
    const diagnosticsErrors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
    expect(diagnosticsErrors, diagnosticsErrors.map(d => d.message).join('\n')).toHaveLength(errors);
    // warnings
    const diagnosticsWarnings = diagnostics.filter(d => d.severity === DiagnosticSeverity.Warning);
    expect(diagnosticsWarnings, diagnosticsWarnings.map(d => d.message).join('\n')).toHaveLength(warnings);
}
