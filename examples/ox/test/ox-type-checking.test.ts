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
        await validate('var myResult: boolean = true and false and true;', 0);
    });

    test('number assignments', async () => {
        await validate('var myResult: number = 2;', 0);
        await validate('var myResult: number = 2 * 3;', 0);
        await validate('var myResult: number = 2 < 3;', 1);
        await validate('var myResult: number = true;', 1);
    });

    test.only('boolean assignments', async () => {
        await validate('var myResult: boolean = true;', 0);
        await validate('var myResult: boolean = 2;', 1);
        await validate('var myResult: boolean = 2 * 3;', 1);
        await validate('var myResult: boolean = 2 < 3;', 0);
    });

});

async function validate(ox: string, errors: number) {
    const document = await parseDocument(oxServices, ox.trim());
    const diagnostics: Diagnostic[] = await oxServices.validation.DocumentValidator.validateDocument(document);
    expect(diagnostics, diagnostics.map(d => d.message).join('\n')).toHaveLength(errors);
}
