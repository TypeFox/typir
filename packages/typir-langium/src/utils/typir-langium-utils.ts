/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { AstNode, AstUtils, LangiumDocument } from 'langium';

export function getDocumentKeyForDocument(document: LangiumDocument): string {
    return document.uri.toString();
}

export function getDocumentKey(node: AstNode): string {
    return getDocumentKeyForDocument(AstUtils.getDocument(node));
}
