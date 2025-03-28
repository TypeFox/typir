/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { EmptyFileSystem } from 'langium';
import { parseDocument } from 'langium/test';
import { deleteAllDocuments } from 'typir-langium';
import { afterEach, expect } from 'vitest';
import { isFunctionType } from '../../../packages/typir/lib/kinds/function/function-type.js';
import { compareValidationIssuesStrict, expectTypirTypes } from '../../../packages/typir/lib/utils/test-utils.js';
import { createOxServices } from '../src/language/ox-module.js';

export const oxServices = createOxServices(EmptyFileSystem).Ox;
export const operatorNames = ['-', '*', '/', '+', '<', '<=', '>', '>=', 'and', 'or', '==', '==', '!=', '!=', '!', '-'];

afterEach(async () => {
    await deleteAllDocuments(oxServices.shared);
    // check, that there are no user-defined classes and functions after clearing/invalidating all LOX documents
    expectTypirTypes(oxServices.typir, isFunctionType, ...operatorNames);
});

export async function validateOx(ox: string, errors: number | string | string[]) {
    const document = await parseDocument(oxServices, ox.trim());
    const diagnostics: string[] = (await oxServices.validation.DocumentValidator.validateDocument(document)).map(d => d.message);
    const msgError = diagnostics.join('\n');
    if (typeof errors === 'number') {
        expect(diagnostics, msgError).toHaveLength(errors);
    } else if (typeof errors === 'string') {
        expect(diagnostics, msgError).toHaveLength(1);
        expect(diagnostics[0], msgError).includes(errors);
    } else {
        compareValidationIssuesStrict(diagnostics, errors);
    }
}
