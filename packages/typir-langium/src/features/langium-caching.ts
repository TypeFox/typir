/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { AstNode, DocumentCache, DocumentState, LangiumSharedCoreServices } from 'langium';
import { CachePending, DomainElementInferenceCaching, Type } from 'typir';
import { getDocumentKey } from '../utils/typir-langium-utils.js';

// cache AstNodes
export class LangiumDomainElementInferenceCaching implements DomainElementInferenceCaching {
    protected readonly cache: DocumentCache<unknown, Type | CachePending>; // removes cached AstNodes, if their underlying LangiumDocuments are invalidated

    constructor(langiumServices: LangiumSharedCoreServices) {
        this.cache = new DocumentCache(langiumServices, DocumentState.IndexedReferences);
    }

    cacheSet(domainElement: AstNode, type: Type): void {
        this.pendingClear(domainElement);
        this.cache.set(getDocumentKey(domainElement), domainElement, type);
    }

    cacheGet(domainElement: AstNode): Type | undefined {
        if (this.pendingGet(domainElement)) {
            return undefined;
        } else {
            return this.cache.get(getDocumentKey(domainElement), domainElement) as (Type | undefined);
        }
    }

    pendingSet(domainElement: AstNode): void {
        this.cache.set(getDocumentKey(domainElement), domainElement, CachePending);
    }

    pendingClear(domainElement: AstNode): void {
        const key = getDocumentKey(domainElement);
        if (this.cache.get(key, domainElement) !== CachePending) {
            // do nothing
        } else {
            this.cache.delete(key, domainElement);
        }
    }

    pendingGet(domainElement: AstNode): boolean {
        const key = getDocumentKey(domainElement);
        return this.cache.has(key, domainElement) && this.cache.get(key, domainElement) === CachePending;
    }
}
