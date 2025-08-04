/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { isAstNode } from 'langium';
import { DefaultTypeConflictPrinter } from 'typir';
import { TypirLangiumSpecifics } from '../typir-langium.js';

export class LangiumProblemPrinter<Specifics extends TypirLangiumSpecifics> extends DefaultTypeConflictPrinter<Specifics> {

    /** When printing a language node, i.e. an AstNode, print the text of the corresponding CstNode. */
    override printLanguageNode(languageNode: Specifics['LanguageType'], sentenceBegin?: boolean | undefined): string {
        if (isAstNode(languageNode)) {
            return `${sentenceBegin ? 'T' : 't'}he AstNode '${languageNode.$cstNode?.text}'`;
        }
        return super.printLanguageNode(languageNode, sentenceBegin);
    }

}
