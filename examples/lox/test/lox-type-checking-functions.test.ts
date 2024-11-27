/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { describe, test } from 'vitest';
import { loxServices, operatorNames, validateLox } from './lox-type-checking-utils.js';
import { expectTypirTypes } from '../../../packages/typir/lib/utils/test-utils.js';
import { isFunctionType } from '../../../packages/typir/lib/kinds/function/function-type.js';

describe('Test type checking for user-defined functions', () => {

    test('function: return value and return type must match', async () => {
        await validateLox('fun myFunction1() : boolean { return true; }', 0);
        await validateLox('fun myFunction2() : boolean { return 2; }', 1);
        await validateLox('fun myFunction3() : number { return 2; }', 0);
        await validateLox('fun myFunction4() : number { return true; }', 1);
        expectTypirTypes(loxServices, isFunctionType, 'myFunction1', 'myFunction2', 'myFunction3', 'myFunction4', ...operatorNames);
    });

    test('overloaded function: different return types are not enough', async () => {
        await validateLox(`
            fun myFunction() : boolean { return true; }
            fun myFunction() : number { return 2; }
        `, 2);
        expectTypirTypes(loxServices, isFunctionType, 'myFunction', 'myFunction', ...operatorNames); // the types are different nevertheless!
    });

    test('overloaded function: different parameter names are not enough', async () => {
        await validateLox(`
            fun myFunction(input: boolean) : boolean { return true; }
            fun myFunction(other: boolean) : boolean { return true; }
        `, 2);
        expectTypirTypes(loxServices, isFunctionType, 'myFunction', ...operatorNames); // but both functions have the same type!
    });

    test('overloaded function: but different parameter types are fine', async () => {
        await validateLox(`
            fun myFunction(input: boolean) : boolean { return true; }
            fun myFunction(input: number) : boolean { return true; }
        `, 0);
        expectTypirTypes(loxServices, isFunctionType, 'myFunction', 'myFunction', ...operatorNames);
    });

});
