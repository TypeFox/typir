/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { describe, test } from 'vitest';
import { validateLox } from './lox-type-checking-utils.js';

describe('Test type checking for operators', () => {

    test('binary operators', async () => {
        await validateLox('var myResult: number = 2 + 3;', 0);
        await validateLox('var myResult: number = 2 - 3;', 0);
        await validateLox('var myResult: number = 2 * 3;', 0);
        await validateLox('var myResult: number = 2 / 3;', 0);

        await validateLox('var myResult: boolean = 2 < 3;', 0);
        await validateLox('var myResult: boolean = 2 <= 3;', 0);
        await validateLox('var myResult: boolean = 2 > 3;', 0);
        await validateLox('var myResult: boolean = 2 >= 3;', 0);

        await validateLox('var myResult: boolean = true and false;', 0);
        await validateLox('var myResult: boolean = true or false;', 0);

        await validateLox('var myResult: boolean = 2 == 3;', 0);
        await validateLox('var myResult: boolean = 2 != 3;', 0);
        await validateLox('var myResult: boolean = true == false;', 0);
        await validateLox('var myResult: boolean = true != false;', 0);

        await validateLox('var myResult: boolean = true == 3;', 0,
            "This comparison will always return 'false' as 'true' and '3' have the different types 'boolean' and 'number'.");
        await validateLox('var myResult: boolean = 2 != false;', 0,
            "This comparison will always return 'true' as '2' and 'false' have the different types 'number' and 'boolean'.");
    });

    test('unary operator: !', async () => {
        await validateLox('var myResult: boolean = !true;', 0);
        await validateLox('var myResult: boolean = !!true;', 0);
        await validateLox('var myResult: boolean = !!!true;', 0);
    });

    test('unary operator: -', async () => {
        await validateLox('var myResult: number = -2;', 0);
        await validateLox('var myResult: number = --2;', 0);
        await validateLox('var myResult: number = ---2;', 0);
    });

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

    test('Only a single problem with the inner expression, since the type of "*" is always number!', async () => {
        await validateLox('var myVar : number = 2 * (2 * false);', [
            "While validating the AstNode '(2 * false)', this error is found: The given operands for the function '*' match the expected types only partially.",
        ]);
    });

    test('Two issues in nested expressions, since "*" expects always numbers, while "and" returns always booleans!', async () => {
        await validateLox('var myVar : number = 2 * (2 and false);', [
            // this is obvious: left and right need to have the same type
            "While validating the AstNode '(2 and false)', this error is found: The given operands for the function 'and' match the expected types only partially.",
            // '*' supports only numbers for left and right, but the right operand is always boolean as result of the 'and' operator
            "While validating the AstNode '2 * (2 and false)', this error is found: The given operands for the function '*' match the expected types only partially.",
        ]);
    });

});
