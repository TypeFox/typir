/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { describe, test } from 'vitest';
import { validateOx } from './ox-type-checking-utils.js';

describe('Test type checking for statements and variables in OX', () => {

    test('multiple nested and', async () => {
        await validateOx('var myResult: boolean = true and false;', 0);
        await validateOx('var myResult: boolean = true and false and true;', 0);
    });

    test('number assignments', async () => {
        await validateOx('var myResult: number = 2;', 0);
        await validateOx('var myResult: number = 2 * 3;', 0);
        await validateOx('var myResult: number = 2 < 3;', 1);
        await validateOx('var myResult: number = true;', 1);
    });

    test('boolean assignments', async () => {
        await validateOx('var myResult: boolean = true;', 0);
        await validateOx('var myResult: boolean = 2;', 1);
        await validateOx('var myResult: boolean = 2 * 3;', 1);
        await validateOx('var myResult: boolean = 2 < 3;', 0);
    });

    test('statement assignments', async () => {
        await validateOx('var myResult: boolean; myResult = true;', 0);
        await validateOx('var myResult: boolean; myResult = 2;', 1);
        await validateOx('var myResult: boolean; myResult = 2 * 3;', 1);
        await validateOx('var myResult: boolean; myResult = 2 < 3;', 0);
    });

    test('boolean in conditions', async () => {
        await validateOx('if ( true ) {}', 0);
        await validateOx('if ( 3 ) {}', 1);
    });

    test('variable declarations', async () => {
        await validateOx('var myVar : boolean;', 0);
        await validateOx('var myVar : number;', 0);
        await validateOx('var myVar : void;', 1);
    });

});
