/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { describe, test } from 'vitest';
import { validateLox } from './lox-type-checking-utils.js';

describe('Test type checking for operators', () => {

    test('overloaded operator "+"', async () => {
        await validateLox('var myResult: number = 1 + 2;', 0);
        await validateLox('var myResult: string = "a" + "b";', 0);
        await validateLox('var myResult: string = "a" + 2;', 0);
        await validateLox('var myResult: string = 1 + "b";', 0);
        await validateLox('var myResult: string = true + "b";', 1);
        await validateLox('var myResult: string = "a" + false;', 1);
    });

    test('use overloaded operators: +', async () => {
        await validateLox('var myVar : number = 2 + 3;', 0, 0);
        await validateLox('var myVar : string = "a" + "b";', 0, 0);
        await validateLox('var myVar : string = "a" + 3;', 0, 0);
        await validateLox('var myVar : string = 2 + "b";', 0, 0);
    });

    test('use overloaded operators: ==', async () => {
        await validateLox('var myVar : boolean = true == false;', 0, 0);
        await validateLox('var myVar : boolean = 2 == 3;', 0, 0);
        await validateLox('var myVar : boolean = true == 3;', 0, 1);
        await validateLox('var myVar : boolean = 2 == false;', 0, 1);
    });

    test('Only a single problem with the inner expression, since the type of "+" is always number!', async () => {
        await validateLox('var myVar : number = 2 + (2 * false);', 1);
    });

});
