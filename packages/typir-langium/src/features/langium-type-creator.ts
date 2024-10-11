/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { AstNode, AstUtils, DocumentState, interruptAndCheck, LangiumDocument } from 'langium';
import { LangiumSharedServices } from 'langium/lsp';
import { Type, TypeEdge, TypeGraph, TypeGraphListener, TypirServices } from 'typir';
import { getDocumentKeyForDocument } from '../utils/typir-langium-utils.js';

export interface LangiumTypeCreator {
    /**
     * For the initialization of the type system, e.g. to register primitive types and operators, inference rules and validation rules.
     * This method will be executed once before the 1st added/updated/removed domain element.
     */
    initialize(): void;

    /** React on updates of the AST in order to add/remove corresponding types from the type system, e.g. user-definied functions. */
    deriveTypeDeclarationsFromAstNode(domainElement: unknown): void;
}

export abstract class AbstractLangiumTypeCreator implements LangiumTypeCreator, TypeGraphListener {
    protected initialized: boolean = false;
    protected currentDocumentKey: string = '';
    protected readonly documentTypesMap: Map<string, Type[]> = new Map();
    protected readonly typeGraph: TypeGraph;

    constructor(typirServices: TypirServices, langiumServices: LangiumSharedServices) {
        this.typeGraph = typirServices.graph;
        langiumServices.workspace.DocumentBuilder.onBuildPhase(DocumentState.IndexedReferences, async (documents, cancelToken) => {
            for (const document of documents) {
                await interruptAndCheck(cancelToken);

                // notify Typir about each contained node of the processed document
                this.processedDocument(document);
            }
        });
        this.typeGraph.addListener(this);
    }

    abstract initialize(): void;

    abstract deriveTypeDeclarationsFromAstNode(_domainElement: AstNode): void;

    protected ensureInitialization() {
        if (!this.initialized) {
            this.initialize();
            this.initialized = true;
        }
    }

    protected processedDocument(document: LangiumDocument): void {
        this.ensureInitialization();
        this.currentDocumentKey = getDocumentKeyForDocument(document);

        // remove all types which were associated with the current document
        (this.documentTypesMap.get(this.currentDocumentKey) ?? [])
            .forEach(typeToRemove => this.typeGraph.removeNode(typeToRemove));

        // create all types for this document
        AstUtils.streamAst(document.parseResult.value)
            .forEach((node: AstNode) => this.deriveTypeDeclarationsFromAstNode(node));

        this.currentDocumentKey = '';
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
    override initialize(): void {
        throw new Error('This method needs to be implemented!');
    }
    override deriveTypeDeclarationsFromAstNode(_domainElement: AstNode): void {
        throw new Error('This method needs to be implemented!');
    }
}
