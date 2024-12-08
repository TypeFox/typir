/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { EmptyFileSystem } from 'langium';
import { parseDocument } from 'langium/test';
import { deleteAllDocuments } from 'typir-langium';
import { afterEach, expect } from 'vitest';
import type { Diagnostic } from 'vscode-languageserver-types';
import { createOxServices } from '../src/language/ox-module.js';
import { expectTypirTypes } from '../../../packages/typir/lib/utils/test-utils.js';
import { isFunctionType } from '../../../packages/typir/lib/kinds/function/function-type.js';

export const oxServices = createOxServices(EmptyFileSystem).Ox;
export const operatorNames = ['-', '*', '/', '+', '<', '<=', '>', '>=', 'and', 'or', '==', '==', '!=', '!=', '!', '-'];

afterEach(async () => {
    await deleteAllDocuments(oxServices.shared);
    // check, that there are no user-defined classes and functions after clearing/invalidating all LOX documents
    expectTypirTypes(oxServices, isFunctionType, ...operatorNames);
});

export async function validateOx(ox: string, errors: number) {
    const document = await parseDocument(oxServices, ox.trim());
    const diagnostics: Diagnostic[] = await oxServices.validation.DocumentValidator.validateDocument(document);
    expect(diagnostics, diagnostics.map(d => d.message).join('\n')).toHaveLength(errors);
}
