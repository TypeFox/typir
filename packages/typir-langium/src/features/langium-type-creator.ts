/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { AstNode } from 'langium';
import { TypeCreator } from 'typir';

export abstract class AbstractLangiumTypeCreator implements TypeCreator {
    protected initialized: boolean = false;

    constructor() {
        // TODO wo auf Updates reagieren, hier?
    }

    abstract initialize(): void;

    protected ensureInitialization() {
        if (!this.initialized) {
            this.initialize();
            this.initialized = true;
        }
    }

    addedDomainElement(_domainElement: AstNode): void {
        this.ensureInitialization();
    }

    updatedDomainElement(_domainElement: AstNode): void {
        throw new Error('For Langium, this function will never be called, since AstNodes will never be updated.');
    }

    removedDomainElement(_domainElement: AstNode): void {
        throw new Error('For Langium, this function will never be called, since the invalidation of AstNodes is handled via dedicated cache implementations.');
    }

}
