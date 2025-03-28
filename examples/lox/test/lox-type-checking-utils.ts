/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { EmptyFileSystem, LangiumDocument } from 'langium';
import { parseDocument } from 'langium/test';
import { compareValidationIssuesStrict, expectTypirTypes, isClassType, isFunctionType } from 'typir';
import { deleteAllDocuments } from 'typir-langium';
import { afterEach, expect } from 'vitest';
import type { Diagnostic } from 'vscode-languageserver-types';
import { DiagnosticSeverity } from 'vscode-languageserver-types';
import { createLoxServices } from '../src/language/lox-module.js';

export const loxServices = createLoxServices(EmptyFileSystem).Lox;
export const operatorNames = ['-', '*', '/', '+', '+', '+', '+', '<', '<=', '>', '>=', 'and', 'or', '==', '!=', '=', '!', '-'];

afterEach(async () => {
    await deleteAllDocuments(loxServices.shared);
    // check, that there are no user-defined classes and functions after clearing/invalidating all LOX documents
    expectTypirTypes(loxServices.typir, isClassType);
    expectTypirTypes(loxServices.typir, isFunctionType, ...operatorNames);
});

export async function validateLox(lox: string, errors: number | string | string[], warnings: number | string | string[] = 0): Promise<LangiumDocument> {
    const document = await parseDocument(loxServices, lox.trim());
    const diagnostics: Diagnostic[] = await loxServices.validation.DocumentValidator.validateDocument(document);

    // errors
    const diagnosticsErrors: string[] = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error).map(d => d.message);
    checkIssues(diagnosticsErrors, errors);

    // warnings
    const diagnosticsWarnings: string[] = diagnostics.filter(d => d.severity === DiagnosticSeverity.Warning).map(d => d.message);
    checkIssues(diagnosticsWarnings, warnings);

    return document;
}

function checkIssues(diagnosticsErrors: string[], errors: number | string | string[]): void {
    const msgError = diagnosticsErrors.join('\n');
    if (typeof errors === 'number') {
        expect(diagnosticsErrors, msgError).toHaveLength(errors);
    } else if (typeof errors === 'string') {
        expect(diagnosticsErrors, msgError).toHaveLength(1);
        expect(diagnosticsErrors[0], msgError).includes(errors);
    } else {
        compareValidationIssuesStrict(diagnosticsErrors, errors);
    }
}
