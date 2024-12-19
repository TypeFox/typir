/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { AstNode, AstUtils, DocumentState, interruptAndCheck, LangiumDocument, LangiumSharedCoreServices } from 'langium';
import { Type, TypeEdge, TypeGraph, TypeGraphListener, TypirServices } from 'typir';
import { getDocumentKeyForDocument, getDocumentKeyForURI } from '../utils/typir-langium-utils.js';

/**
 * This service provides the API to define the actual types, inference rules and validation rules
 * for a textual DSL developed with Langium in order to include them into the Langium lifecycle.
 */
export interface LangiumTypeCreator {
    /**
     * This function needs to be called once to trigger the initialization process.
     * Depending on the implemention, it might or might not call onInitialize().
     */
    triggerInitialization(): void;

    /**
     * For the initialization of the type system, e.g. to register primitive types and operators, inference rules and validation rules,
     * which are constant and don't depend on the actual language nodes.
     * This method will be executed once before the first added/updated/removed language node.
     */
    onInitialize(): void;

    /**
     * React on updates of the AST in order to add/remove corresponding types from the type system,
     * e.g. for user-defined functions to create corresponding function types in the type graph.
     * @param languageNode an AstNode of the current AST
     */
    onNewAstNode(languageNode: AstNode): void;
}

export abstract class AbstractLangiumTypeCreator implements LangiumTypeCreator, TypeGraphListener {
    protected initialized: boolean = false;
    protected currentDocumentKey: string = '';
    protected readonly documentTypesMap: Map<string, Type[]> = new Map();
    protected readonly typeGraph: TypeGraph;

    constructor(typirServices: TypirServices, langiumServices: LangiumSharedCoreServices) {
        this.typeGraph = typirServices.infrastructure.Graph;

        // for new and updated documents:
        // Create Typir types after completing the Langium 'ComputedScopes' phase, since they need to be available for the following Linking phase
        langiumServices.workspace.DocumentBuilder.onBuildPhase(DocumentState.ComputedScopes, async (documents, cancelToken) => {
            for (const document of documents) {
                await interruptAndCheck(cancelToken);

                // notify Typir about each contained node of the processed document
                this.handleProcessedDocument(document); // takes care about the invalid AstNodes as well
            }
        });

        // for deleted documents:
        // Delete Typir types which are derived from AstNodes of deleted documents
        langiumServices.workspace.DocumentBuilder.onUpdate((_changed, deleted) => {
            deleted
                .map(del => getDocumentKeyForURI(del))
                .forEach(del => this.invalidateTypesOfDocument(del));
        });

        // get informed about added/removed types in Typir's type graph
        this.typeGraph.addListener(this);
    }

    abstract onInitialize(): void;

    abstract onNewAstNode(languageNode: AstNode): void;

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

        // For a NEW document, this is called, but nothing happens.
        // For an UPDATED document, Langium deletes the whole previous AST and creates a complete new AST.
        // Therefore all types which were created for such (now invalid) AstNodes and therefore associated with the current document need to be removed.
        this.invalidateTypesOfDocument(this.currentDocumentKey);

        // create all types for this document
        AstUtils.streamAst(document.parseResult.value)
            .forEach((node: AstNode) => this.onNewAstNode(node));

        this.currentDocumentKey = ''; // reset the key, newly created types will be associated with no document now
    }

    protected invalidateTypesOfDocument(documentKey: string): void {
        // grab all types which were created for the document
        (this.documentTypesMap.get(documentKey)
            // there are no types, if the document is new or if no types were created for the previous document version
            ?? [])
            // this is the central way to remove types from the type systems, there is no need to inform the kinds
            .forEach(typeToRemove => this.typeGraph.removeNode(typeToRemove));
        // remove the deleted types from the map
        this.documentTypesMap.delete(documentKey);
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
        // since this type creator actively removes types from the type graph itself, there is no need to react on removed types
    }
    addedEdge(_edge: TypeEdge): void {
        // this type creator does not care about edges => do nothing
    }
    removedEdge(_edge: TypeEdge): void {
        // this type creator does not care about edges => do nothing
    }
}

export class PlaceholderLangiumTypeCreator extends AbstractLangiumTypeCreator {
    constructor(typirServices: TypirServices, langiumServices: LangiumSharedCoreServices) {
        super(typirServices, langiumServices);
    }
    override onInitialize(): void {
        throw new Error('This method needs to be implemented! Extend the AbstractLangiumTypeCreator and register it in the Typir module: TypeCreator: (typirServices) => new MyLangiumTypeCreator(typirServices, langiumServices)');
    }
    override onNewAstNode(_languageNode: AstNode): void {
        throw new Error('This method needs to be implemented! Extend the AbstractLangiumTypeCreator and register it in the Typir module: TypeCreator: (typirServices) => new MyLangiumTypeCreator(typirServices, langiumServices)');
    }
}
