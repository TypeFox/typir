/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/
import { describe, expect, test } from 'vitest';
import { Parser } from '../src/parser.js';
import { initializeTypir } from '../src/type-system.js';
import { validate } from '../src/validator.js';

const typir = initializeTypir();

describe('Validator', () => {
    test('Positives', () => {
        expectValidationMessages('VAR X = 1+2+3; PRINT X;');
        expectValidationMessages('PRINT 1+2+3;');
        expectValidationMessages('PRINT "Hallo!";');
        expectValidationMessages('PRINT "Hallo!"+"Welt!";');
    });
    test('Negatives', () => {
        expectValidationMessages('VAR X = 1; X = "hallo";', 'The given operands for the overloaded function \'-\' match the expected types only partially.');
        expectValidationMessages('PRINT "1"-"2";', 'The given operands for the overloaded function \'-\' match the expected types only partially.');
        expectValidationMessages('PRINT 123-"hallo";', 'The given operands for the overloaded function \'-\' match the expected types only partially.');
    });
});


function expectValidationMessages(text: string, ...messages: string[]) {
    const model = new Parser().parse(text);
    const actual: string[] = [];
    validate(typir, model, m => actual.push(m));
    expect(actual).toStrictEqual(messages);
}
