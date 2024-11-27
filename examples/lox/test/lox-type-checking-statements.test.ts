/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { describe, test } from 'vitest';
import { validateLox } from './lox-type-checking-utils.js';

describe('Test type checking for statements and variables in LOX', () => {

    test('multiple nested and', async () => {
        await validateLox('var myResult: boolean = true and false;', 0);
        await validateLox('var myResult: boolean = true and false and true;', 0);
    });

    test('number assignments', async () => {
        await validateLox('var myResult: number = 2;', 0);
        await validateLox('var myResult: number = 2 * 3;', 0);
        await validateLox('var myResult: number = 2 < 3;', 1);
        await validateLox('var myResult: number = true;', 1);
    });

    test('boolean assignments', async () => {
        await validateLox('var myResult: boolean = true;', 0);
        await validateLox('var myResult: boolean = 2;', 1);
        await validateLox('var myResult: boolean = 2 * 3;', 1);
        await validateLox('var myResult: boolean = 2 < 3;', 0);
    });

    test('statement assignments', async () => {
        await validateLox('var myResult: boolean; myResult = true;', 0);
        await validateLox('var myResult: boolean; myResult = 2;', 1);
        await validateLox('var myResult: boolean; myResult = 2 * 3;', 1);
        await validateLox('var myResult: boolean; myResult = 2 < 3;', 0);
    });

    test('boolean in conditions', async () => {
        await validateLox('if ( true ) {}', 0);
        await validateLox('if ( 3 ) {}', 1);
    });

    test('variable declarations', async () => {
        await validateLox('var myVar : boolean;', 0);
        await validateLox('var myVar : number;', 0);
        await validateLox('var myVar : void;', 1);
    });

    test('Variables without explicit type: assignment', async () => {
        await validateLox(`
            var min = 14;
            var max = 22;
            max = min;
        `, 0);
    });

    test('Variables without explicit type: assign expression to var without type', async () => {
        await validateLox(`
            var min = 14;
            var max = 22;
            var sum = min + max;
        `, 0);
    });

    test('Variables without explicit type: assign expression to var with type', async () => {
        await validateLox(`
            var min = 14;
            var max = 22;
            var sum : number = min + max;
        `, 0);
    });

    test('Variables without explicit type: assign var again with expression of overloaded operator +', async () => {
        await validateLox(`
            var min = 14;
            var max = 22;
            max = min + max;
        `, 0);
    });

    test('Variables without explicit type: assign var again with expression of overloaded operator -', async () => {
        await validateLox(`
            var min = 14;
            var max = 22;
            max = min - max;
        `, 0);
    });

    test('Variables without explicit type: assign var again with expression of not overloaded operator *', async () => {
        await validateLox(`
            var min = 14;
            var max = 22;
            max = min * max;
        `, 0);
    });

    test('Variables without explicit type: used in function', async () => {
        await validateLox(`
            var min = 14;
            var max = 22;
            var average = (min + max) / 2;
        `, 0);
    });

});
