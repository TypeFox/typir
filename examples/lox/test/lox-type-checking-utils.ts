/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { EmptyFileSystem } from 'langium';
import { parseDocument } from 'langium/test';
import { expectTypirTypes, isClassType, isFunctionType } from 'typir';
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
    expectTypirTypes(loxServices, isClassType);
    expectTypirTypes(loxServices, isFunctionType, ...operatorNames);
});

export async function validateLox(lox: string, errors: number | string | string[], warnings: number = 0) {
    const document = await parseDocument(loxServices, lox.trim());
    const diagnostics: Diagnostic[] = await loxServices.validation.DocumentValidator.validateDocument(document);

    // errors
    const diagnosticsErrors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error).map(d => fixMessage(d.message));
    const msgError = diagnosticsErrors.join('\n');
    if (typeof errors === 'number') {
        expect(diagnosticsErrors, msgError).toHaveLength(errors);
    } else if (typeof errors === 'string') {
        expect(diagnosticsErrors, msgError).toHaveLength(1);
        expect(diagnosticsErrors[0]).toBe(errors);
    } else {
        expect(diagnosticsErrors, msgError).toHaveLength(errors.length);
        for (const expected of errors) {
            expect(diagnosticsErrors).includes(expected);
        }
    }

    // warnings
    const diagnosticsWarnings = diagnostics.filter(d => d.severity === DiagnosticSeverity.Warning).map(d => fixMessage(d.message));
    const msgWarning = diagnosticsWarnings.join('\n');
    expect(diagnosticsWarnings, msgWarning).toHaveLength(warnings);
}

function fixMessage(msg: string): string {
    if (msg.startsWith('While validating the AstNode')) {
        const inbetween = 'this error is found: ';
        return msg.substring(msg.indexOf(inbetween) + inbetween.length);
    }
    return msg;
}
