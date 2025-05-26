/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/
import { compareValidationIssuesStrict } from 'typir/test';
import { describe, test } from 'vitest';
import { Parser } from '../src/expression-parser.js';
import { initializeTypir } from '../src/expression-type-system.js';
import { validate } from '../src/expression-validator.js';

const typir = initializeTypir();

describe('Validator', () => {
    test('Positives', () => {
        expectValidationMessages('VAR X = 1+2+3; PRINT X;');
        expectValidationMessages('PRINT 1+2+3;');
        expectValidationMessages('PRINT "Hallo!";');
        expectValidationMessages('PRINT "Hallo!"+"Welt!";');
        expectValidationMessages('VAR X = "Hallo!"; X = 123;'); //coercion rule applies!
    });
    test('Negatives', () => {
        expectValidationMessages('VAR X = 1; X = "hallo";', "'string' is not assignable to 'number'.");
        expectValidationMessages('PRINT "1"-"2";', "The given operands for the call of the overload '-' don't match.");
        expectValidationMessages('PRINT 123-"hallo";', "The given operands for the call of the overload '-' don't match.");
    });
});


function expectValidationMessages(text: string, ...messages: string[]) {
    const model = new Parser().parse(text);
    const actual: string[] = [];
    validate(typir, model, m => actual.push(m));
    compareValidationIssuesStrict(actual, messages);
}
