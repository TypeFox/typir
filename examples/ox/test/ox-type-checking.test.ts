/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { EmptyFileSystem } from 'langium';
import { parseDocument } from 'langium/test';
import { describe, expect, test } from 'vitest';
import type { Diagnostic } from 'vscode-languageserver-types';
import { createOxServices } from '../src/language/ox-module.js';

const oxServices = createOxServices(EmptyFileSystem).Ox;

describe('Explicitly test type checking for OX', () => {

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

    // TODO add new test cases to LOX as well
    test('binary operators', async () => {
        await validate('var myResult: number = 2 + 3;', 0);
        await validate('var myResult: number = 2 - 3;', 0);
        await validate('var myResult: number = 2 * 3;', 0);
        await validate('var myResult: number = 2 / 3;', 0);

        await validate('var myResult: boolean = 2 < 3;', 0);
        await validate('var myResult: boolean = 2 <= 3;', 0);
        await validate('var myResult: boolean = 2 > 3;', 0);
        await validate('var myResult: boolean = 2 >= 3;', 0);

        await validate('var myResult: boolean = true and false;', 0);
        await validate('var myResult: boolean = true or false;', 0);

        await validate('var myResult: boolean = 2 == 3;', 0);
        await validate('var myResult: boolean = 2 != 3;', 0);
        await validate('var myResult: boolean = true == false;', 0);
        await validate('var myResult: boolean = true != false;', 0);
    });

    test('unary operator: !', async () => {
        await validate('var myResult: boolean = !true;', 0);
        await validate('var myResult: boolean = !!true;', 0);
        await validate('var myResult: boolean = !!!true;', 0);
    });

    test('unary operator: -', async () => {
        await validate('var myResult: number = -2;', 0);
        await validate('var myResult: number = --2;', 0);
        await validate('var myResult: number = ---2;', 0);
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

    test('use overloaded operators', async () => {
        await validate('var myVar : boolean = true == false;', 0);
        await validate('var myVar : boolean = 2 == 3;', 0);
        await validate('var myVar : boolean = true == 3;', 1);
        await validate('var myVar : boolean = 2 == false;', 1);
    });

    test('Only a single problem with the inner expression, since the type of "+" is always number!', async () => {
        await validate('var myVar : number = 2 + (2 == false);', 2); // TODO should be only 1 problem ...
    });

});

async function validate(ox: string, errors: number) {
    const document = await parseDocument(oxServices, ox.trim());
    const diagnostics: Diagnostic[] = await oxServices.validation.DocumentValidator.validateDocument(document);
    expect(diagnostics, diagnostics.map(d => d.message).join('\n')).toHaveLength(errors);
}
