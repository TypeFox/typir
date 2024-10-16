/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { AstNode, ContextCache, DocumentState, LangiumSharedCoreServices, URI } from 'langium';
import { LangiumSharedServices } from 'langium/lsp';
import { CachePending, DomainElementInferenceCaching, Type } from 'typir';
import { getDocumentKey } from '../utils/typir-langium-utils.js';

// cache AstNodes
export class LangiumDomainElementInferenceCaching implements DomainElementInferenceCaching {
    protected readonly cache: DocumentCache<unknown, Type | CachePending>; // removes cached AstNodes, if their underlying LangiumDocuments are invalidated

    constructor(langiumServices: LangiumSharedServices) {
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


// TODO this is copied from Langium, since the introducing PR #1659 will be included in the upcoming Langium version 3.3 (+ PR #1712), after releasing v3.3 this class can be removed completely!
/**
 * Every key/value pair in this cache is scoped to a document.
 * If this document is changed or deleted, all associated key/value pairs are deleted.
 */
export class DocumentCache<K, V> extends ContextCache<URI | string, K, V, string> {

    /**
     * Creates a new document cache.
     *
     * @param sharedServices Service container instance to hook into document lifecycle events.
     * @param state Optional document state on which the cache should evict.
     * If not provided, the cache will evict on `DocumentBuilder#onUpdate`.
     * *Deleted* documents are considered in both cases.
     *
     * Providing a state here will use `DocumentBuilder#onDocumentPhase` instead,
     * which triggers on all documents that have been affected by this change, assuming that the
     * state is `DocumentState.Linked` or a later state.
     */
    constructor(sharedServices: LangiumSharedCoreServices, state?: DocumentState) {
        super(uri => uri.toString());
        if (state) {
            this.toDispose.push(sharedServices.workspace.DocumentBuilder.onDocumentPhase(state, document => {
                this.clear(document.uri.toString());
            }));
            this.toDispose.push(sharedServices.workspace.DocumentBuilder.onUpdate((_changed, deleted) => {
                for (const uri of deleted) { // react only on deleted documents
                    this.clear(uri);
                }
            }));
        } else {
            this.toDispose.push(sharedServices.workspace.DocumentBuilder.onUpdate((changed, deleted) => {
                const allUris = changed.concat(deleted); // react on both changed and deleted documents
                for (const uri of allUris) {
                    this.clear(uri);
                }
            }));
        }
    }
}
