/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { describe, test } from "vitest";
import { validateOx } from "./ox-type-checking-utils.js";

describe("Test type checking for statements and variables in OX", () => {
    test("binary operators", async () => {
        await validateOx("var myResult: number = 2 + 3;", 0);
        await validateOx("var myResult: number = 2 - 3;", 0);
        await validateOx("var myResult: number = 2 * 3;", 0);
        await validateOx("var myResult: number = 2 / 3;", 0);

        await validateOx("var myResult: boolean = 2 < 3;", 0);
        await validateOx("var myResult: boolean = 2 <= 3;", 0);
        await validateOx("var myResult: boolean = 2 > 3;", 0);
        await validateOx("var myResult: boolean = 2 >= 3;", 0);

        await validateOx("var myResult: boolean = true and false;", 0);
        await validateOx("var myResult: boolean = true or false;", 0);

        await validateOx("var myResult: boolean = 2 == 3;", 0);
        await validateOx("var myResult: boolean = 2 != 3;", 0);
        await validateOx("var myResult: boolean = true == false;", 0);
        await validateOx("var myResult: boolean = true != false;", 0);

        await validateOx("var myResult: boolean = true == 3;", 1);
        await validateOx("var myResult: boolean = 2 != false;", 1);
    });

    test("unary operator: !", async () => {
        await validateOx("var myResult: boolean = !true;", 0);
        await validateOx("var myResult: boolean = !!true;", 0);
        await validateOx("var myResult: boolean = !!!true;", 0);
    });

    test("unary operator: -", async () => {
        await validateOx("var myResult: number = -2;", 0);
        await validateOx("var myResult: number = --2;", 0);
        await validateOx("var myResult: number = ---2;", 0);
    });

    test("use overloaded operators", async () => {
        await validateOx("var myVar : boolean = true == false;", 0);
        await validateOx("var myVar : boolean = 2 == 3;", 0);
        await validateOx("var myVar : boolean = true == 3;", 1);
        await validateOx("var myVar : boolean = 2 == false;", 1);
    });

    test('Only a single problem with the inner expression, since the type of "*" is always number!', async () => {
        await validateOx("var myVar : number = 2 * (2 * false);", [
            "While validating the AstNode '(2 * false)', this error is found: The given operands for the call of '*' don't match.",
        ]);
    });

    test('Two issues in nested expressions, since "*" expects always numbers, while "and" returns always booleans!', async () => {
        await validateOx("var myVar : number = 2 * (2 and false);", [
            // this is obvious: left and right need to have the same type
            "While validating the AstNode '(2 and false)', this error is found: The given operands for the call of 'and' don't match.",
            // '*' supports only numbers for left and right, but the right operand is always boolean as result of the 'and' operator
            "While validating the AstNode '2 * (2 and false)', this error is found: The given operands for the call of '*' don't match.",
        ]);
    });
});
