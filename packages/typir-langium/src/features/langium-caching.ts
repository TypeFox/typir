/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { AstNode, AstUtils, DocumentCache } from 'langium';
import { LangiumSharedServices } from 'langium/lsp';
import { CachePending, DefaultTypeRelationshipCaching, DomainElementInferenceCaching, EdgeCachingInformation, Type } from 'typir';

// cache Type relationships
export class LangiumTypeRelationshipCaching extends DefaultTypeRelationshipCaching {

    protected override storeCachingInformation(value: EdgeCachingInformation | undefined): boolean {
        // TODO for now, don't cache values, since they need to be reset for updates of Langium documents otherwise!
        return value === 'PENDING';
    }

}


// cache AstNodes
export class LangiumDomainElementInferenceCaching implements DomainElementInferenceCaching {
    protected readonly cache: DocumentCache<unknown, Type | CachePending>; // removes cached AstNodes, if their underlying LangiumDocuments are invalidated

    constructor(langiumServices: LangiumSharedServices) {
        this.cache = new DocumentCache(langiumServices);
    }

    protected getDocumentKey(node: AstNode): string {
        return AstUtils.getDocument(node).uri.toString();
    }

    cacheSet(domainElement: AstNode, type: Type): void {
        this.pendingClear(domainElement);
        this.cache.set(this.getDocumentKey(domainElement), domainElement, type);
    }

    cacheGet(domainElement: AstNode): Type | undefined {
        if (this.pendingGet(domainElement)) {
            return undefined;
        } else {
            return this.cache.get(this.getDocumentKey(domainElement), domainElement) as (Type | undefined);
        }
    }

    pendingSet(domainElement: AstNode): void {
        this.cache.set(this.getDocumentKey(domainElement), domainElement, CachePending);
    }

    pendingClear(domainElement: AstNode): void {
        const key = this.getDocumentKey(domainElement);
        if (this.cache.get(key, domainElement) !== CachePending) {
            // do nothing
        } else {
            this.cache.delete(key, domainElement);
        }
    }

    pendingGet(domainElement: AstNode): boolean {
        const key = this.getDocumentKey(domainElement);
        return this.cache.has(key, domainElement) && this.cache.get(key, domainElement) === CachePending;
    }
}
