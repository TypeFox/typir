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

    test('verify extra properties in some actions', async () => {
        const oxText = `
        var myResult: boolean = true and false and true;
        `.trim();

        const document = await parseDocument(oxServices, oxText);
        const diagnostics: Diagnostic[] = await oxServices.validation.DocumentValidator.validateDocument(document);
        expect(diagnostics, diagnostics.map(d => d.message).join('\n')).toHaveLength(0);
    });

});
