/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { AstNode, AstUtils, LangiumDocument, LangiumSharedCoreServices, URI } from 'langium';

export function getDocumentKeyForURI(document: URI): string {
    return document.toString();
}

export function getDocumentKeyForDocument(document: LangiumDocument): string {
    return getDocumentKeyForURI(document.uri);
}

export function getDocumentKey(node: AstNode): string {
    return getDocumentKeyForDocument(AstUtils.getDocument(node));
}

export async function deleteAllDocuments(services: LangiumSharedCoreServices) {
    const docsToDelete = services.workspace.LangiumDocuments.all
        .map((x) => x.uri)
        .toArray();
    await services.workspace.DocumentBuilder.update(
        [], // update no documents
        docsToDelete // delete all documents
    );
}
