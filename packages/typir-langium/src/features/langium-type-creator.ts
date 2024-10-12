/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { AstNode, AstUtils, DocumentState, interruptAndCheck, LangiumDocument } from 'langium';
import { LangiumSharedServices } from 'langium/lsp';
import { Type, TypeEdge, TypeGraph, TypeGraphListener, TypirServices } from 'typir';
import { getDocumentKeyForDocument, getDocumentKeyForURI } from '../utils/typir-langium-utils.js';

export interface LangiumTypeCreator {
    triggerInitialization(): void;

    /**
     * For the initialization of the type system, e.g. to register primitive types and operators, inference rules and validation rules.
     * This method will be executed once before the 1st added/updated/removed domain element.
     */
    onInitialize(): void;

    /** React on updates of the AST in order to add/remove corresponding types from the type system, e.g. user-definied functions. */
    onNewAstNode(domainElement: unknown): void;
}

export abstract class AbstractLangiumTypeCreator implements LangiumTypeCreator, TypeGraphListener {
    protected initialized: boolean = false;
    protected currentDocumentKey: string = '';
    protected readonly documentTypesMap: Map<string, Type[]> = new Map();
    protected readonly typeGraph: TypeGraph;

    constructor(typirServices: TypirServices, langiumServices: LangiumSharedServices) {
        this.typeGraph = typirServices.graph;

        // for new and updated documents
        langiumServices.workspace.DocumentBuilder.onBuildPhase(DocumentState.IndexedReferences, async (documents, cancelToken) => {
            for (const document of documents) {
                await interruptAndCheck(cancelToken);

                // notify Typir about each contained node of the processed document
                this.handleProcessedDocument(document);
            }
        });
        // for deleted documents
        langiumServices.workspace.DocumentBuilder.onUpdate((_changed, deleted) => {
            deleted
                .map(del => getDocumentKeyForURI(del))
                .forEach(del => this.handleDeletedDocument(del));
        });

        // get informed about added/removed types
        this.typeGraph.addListener(this);
    }

    abstract onInitialize(): void;

    abstract onNewAstNode(domainElement: AstNode): void;

    /**
     * Starts the initialization.
     * If this method is called multiple times, the initialization is done only once.
     */
    triggerInitialization() {
        if (!this.initialized) {
            this.onInitialize();
            this.initialized = true;
        }
    }

    protected handleProcessedDocument(document: LangiumDocument): void {
        this.triggerInitialization();
        this.currentDocumentKey = getDocumentKeyForDocument(document); // remember the key in order to map newly created types to the current document

        // remove all types which were associated with the current document
        this.handleDeletedDocument(this.currentDocumentKey);

        // create all types for this document
        AstUtils.streamAst(document.parseResult.value)
            .forEach((node: AstNode) => this.onNewAstNode(node));

        this.currentDocumentKey = '';
    }

    protected handleDeletedDocument(documentKey: string): void {
        (this.documentTypesMap.get(documentKey) ?? [])
            // this is the central way to remove types from the type systems, there is no need to inform the kinds
            .forEach(typeToRemove => this.typeGraph.removeNode(typeToRemove));
    }

    addedType(newType: Type): void {
        // the TypeGraph notifies about newly created Types
        if (this.currentDocumentKey) {
            // associate the new type with the current Langium document!
            let types = this.documentTypesMap.get(this.currentDocumentKey);
            if (!types) {
                types = [];
                this.documentTypesMap.set(this.currentDocumentKey, types);
            }
            types.push(newType);
        } else {
            // types which don't belong to a Langium document
        }
    }

    removedType(_type: Type): void {
        // do nothing
    }
    addedEdge(_edge: TypeEdge): void {
        // do nothing
    }
    removedEdge(_edge: TypeEdge): void {
        // do nothing
    }
}

export class IncompleteLangiumTypeCreator extends AbstractLangiumTypeCreator {
    constructor(typirServices: TypirServices, langiumServices: LangiumSharedServices) {
        super(typirServices, langiumServices);
    }
    override onInitialize(): void {
        throw new Error('This method needs to be implemented!');
    }
    override onNewAstNode(_domainElement: AstNode): void {
        throw new Error('This method needs to be implemented!');
    }
}
