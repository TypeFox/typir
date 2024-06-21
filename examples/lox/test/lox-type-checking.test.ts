/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { EmptyFileSystem } from 'langium';
import { parseDocument } from 'langium/test';
import { describe, expect, test } from 'vitest';
import type { Diagnostic } from 'vscode-languageserver-types';
import { createLoxServices } from '../src/lox-module.js';

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
        // await validate('if ( true ) {}', 0);
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

    test('use overloaded operators', async () => {
        await validate('var myVar : boolean = true == false;', 0);
        await validate('var myVar : boolean = 2 == 3;', 0);
        await validate('var myVar : boolean = true == 3;', 1);
        await validate('var myVar : boolean = 2 == false;', 1);
    });

    test('Only a single problem with the inner expression, since the type of "+" is always number!', async () => {
        await validate('var myVar : number = 2 + (2 == false);', 2); // TODO should be only 1 problem ...
    });

    test('Class', async () => {
        await validate(`
            class MyClass { name: string age: number }
            var v1 = MyClass(); // constructor call
        `, 0);
    });

});

async function validate(lox: string, errors: number) {
    const document = await parseDocument(loxServices, lox.trim());
    const diagnostics: Diagnostic[] = await loxServices.validation.DocumentValidator.validateDocument(document);
    expect(diagnostics, diagnostics.map(d => d.message).join('\n')).toHaveLength(errors);
}
