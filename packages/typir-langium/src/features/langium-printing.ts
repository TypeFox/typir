/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import type { AstNode } from 'langium';
import { isAstNode } from 'langium';
import { DefaultTypeConflictPrinter } from 'typir';

export class LangiumProblemPrinter extends DefaultTypeConflictPrinter<AstNode> {
    /** When printing a language node, i.e. an AstNode, print the text of the corresponding CstNode. */
    override printLanguageNode(
        languageNode: AstNode,
        sentenceBegin?: boolean | undefined,
    ): string {
        if (isAstNode(languageNode)) {
            return `${sentenceBegin ? 'T' : 't'}he AstNode '${languageNode.$cstNode?.text}'`;
        }
        return super.printLanguageNode(languageNode, sentenceBegin);
    }
}
