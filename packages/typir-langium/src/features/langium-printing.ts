/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { isAstNode } from 'langium';
import { DefaultTypeConflictPrinter } from 'typir';

export class LangiumProblemPrinter extends DefaultTypeConflictPrinter {

    /** When printing a domain element, i.e. an AstNode, print the text of the corresponding CstNode. */
    override printDomainElement(domainElement: unknown, sentenceBegin?: boolean | undefined): string {
        if (isAstNode(domainElement)) {
            return `${sentenceBegin ? 'T' : 't'}he AstNode '${domainElement.$cstNode?.text}'`;
        }
        return super.printDomainElement(domainElement, sentenceBegin);
    }

}
