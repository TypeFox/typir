/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { describe, test } from 'vitest';
import { validateOx } from './ox-type-checking-utils.js';

describe('Test type checking for statements and variables in OX', () => {

    test('function: return value and return type', async () => {
        await validateOx('fun myFunction1() : boolean { return true; }', 0);
        await validateOx('fun myFunction2() : boolean { return 2; }', 1);
        await validateOx('fun myFunction3() : number { return 2; }', 0);
        await validateOx('fun myFunction4() : number { return true; }', 1);
    });

    test('function: the same function name twice (in the same file) is not allowed in Typir', async () => {
        await validateOx(`
            fun myFunction() : boolean { return true; }
            fun myFunction() : boolean { return false; }
        `, 2); // both functions should be marked as "duplicate"
    });

    // TODO this test case needs to be investigated in more detail
    test.todo('function: the same function name twice (even in different files) is not allowed in Typir', async () => {
        await validateOx('fun myFunction() : boolean { return true; }', 0);
        await validateOx('fun myFunction() : boolean { return false; }', 2); // now, both functions should be marked as "duplicate"
    });

});
