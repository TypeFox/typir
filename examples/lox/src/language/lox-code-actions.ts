/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
******************************************************************************/

import { DiagnosticData, LangiumDocument, MaybePromise } from 'langium';
import { CodeActionProvider } from 'langium/lsp';
import { CancellationToken, CodeAction, CodeActionKind, CodeActionParams, Command, Diagnostic } from 'vscode-languageserver';
import { LoxProgram } from './generated/ast.js';
import { TypeIssueCodes } from './lox-type-checking.js';

export class LoxCodeActionProvider implements CodeActionProvider {

    getCodeActions(document: LangiumDocument<LoxProgram>, params: CodeActionParams, _cancelToken?: CancellationToken): MaybePromise<Array<Command | CodeAction> | undefined> {
        const result: CodeAction[] = [];
        const acceptor = (ca: CodeAction | undefined) => ca && result.push(ca);
        for (const diagnostic of params.context.diagnostics) {
            this.createCodeActions(diagnostic, document, acceptor);
        }
        return result;
    }

    private createCodeActions(diagnostic: Diagnostic, document: LangiumDocument<LoxProgram>, accept: (ca: CodeAction | undefined) => void): void {
        switch ((diagnostic.data as DiagnosticData)?.code) {
            case TypeIssueCodes.ComparisonIsAlwaysTrue:
                accept(this.replaceComparisonExpressionByTrueFalse(diagnostic, document, true));
                break;
            case TypeIssueCodes.ComparisonIsAlwaysFalse:
                accept(this.replaceComparisonExpressionByTrueFalse(diagnostic, document, false));
                break;
        }
        return undefined;
    }

    private replaceComparisonExpressionByTrueFalse(diagnostic: Diagnostic, document: LangiumDocument<LoxProgram>, result: boolean): CodeAction {
        return {
            title: `Simplify expression to '${result}'`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            isPreferred: true,
            edit: {
                changes: {
                    [document.textDocument.uri]: [{
                        range: { // replace the whole binary expression ...
                            start: diagnostic.range.start,
                            end: diagnostic.range.end,
                        },
                        newText: `${result}`, // ... by the resulting boolean literal
                    }]
                }
            }
        };
    }

}
