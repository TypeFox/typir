/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { DocumentCache, DocumentState } from 'langium';
import { CachePending, LanguageNodeInferenceCaching, Type } from 'typir';
import { TypirLangiumServices, TypirLangiumSpecifics } from '../typir-langium.js';
import { getDocumentKey } from '../utils/typir-langium-utils.js';

// cache AstNodes
export class LangiumLanguageNodeInferenceCaching<Specifics extends TypirLangiumSpecifics> implements LanguageNodeInferenceCaching {
    protected readonly cache: DocumentCache<unknown, Type | CachePending>; // removes cached AstNodes, if their underlying LangiumDocuments are invalidated

    constructor(typirServices: TypirLangiumServices<Specifics>) {
        this.cache = new DocumentCache(typirServices.langium.LangiumServices, DocumentState.IndexedReferences);
    }

    cacheSet(languageNode: Specifics['LanguageType'], type: Type): void {
        this.pendingClear(languageNode);
        this.cache.set(getDocumentKey(languageNode), languageNode, type);
    }

    cacheGet(languageNode: Specifics['LanguageType']): Type | undefined {
        if (this.pendingGet(languageNode)) {
            return undefined;
        } else {
            return this.cache.get(getDocumentKey(languageNode), languageNode) as (Type | undefined);
        }
    }

    cacheClear(): void {
        this.cache.clear();
    }

    pendingSet(languageNode: Specifics['LanguageType']): void {
        this.cache.set(getDocumentKey(languageNode), languageNode, CachePending);
    }

    pendingClear(languageNode: Specifics['LanguageType']): void {
        const key = getDocumentKey(languageNode);
        if (this.cache.get(key, languageNode) !== CachePending) {
            // do nothing
        } else {
            this.cache.delete(key, languageNode);
        }
    }

    pendingGet(languageNode: Specifics['LanguageType']): boolean {
        const key = getDocumentKey(languageNode);
        return this.cache.has(key, languageNode) && this.cache.get(key, languageNode) === CachePending;
    }
}
