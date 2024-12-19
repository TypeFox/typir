/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { AstNode, DocumentCache, DocumentState, LangiumSharedCoreServices } from 'langium';
import { CachePending, LanguageNodeInferenceCaching, Type } from 'typir';
import { getDocumentKey } from '../utils/typir-langium-utils.js';

// cache AstNodes
export class LangiumLanguageNodeInferenceCaching implements LanguageNodeInferenceCaching {
    protected readonly cache: DocumentCache<unknown, Type | CachePending>; // removes cached AstNodes, if their underlying LangiumDocuments are invalidated

    constructor(langiumServices: LangiumSharedCoreServices) {
        this.cache = new DocumentCache(langiumServices, DocumentState.IndexedReferences);
    }

    cacheSet(languageNode: AstNode, type: Type): void {
        this.pendingClear(languageNode);
        this.cache.set(getDocumentKey(languageNode), languageNode, type);
    }

    cacheGet(languageNode: AstNode): Type | undefined {
        if (this.pendingGet(languageNode)) {
            return undefined;
        } else {
            return this.cache.get(getDocumentKey(languageNode), languageNode) as (Type | undefined);
        }
    }

    pendingSet(languageNode: AstNode): void {
        this.cache.set(getDocumentKey(languageNode), languageNode, CachePending);
    }

    pendingClear(languageNode: AstNode): void {
        const key = getDocumentKey(languageNode);
        if (this.cache.get(key, languageNode) !== CachePending) {
            // do nothing
        } else {
            this.cache.delete(key, languageNode);
        }
    }

    pendingGet(languageNode: AstNode): boolean {
        const key = getDocumentKey(languageNode);
        return this.cache.has(key, languageNode) && this.cache.get(key, languageNode) === CachePending;
    }
}
