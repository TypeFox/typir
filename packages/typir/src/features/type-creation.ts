/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

export interface TypeCreator {
    /** For the initialization of the type system, e.g. to register primitive types and operators, inference rules and validation rules. */
    initialize(): void;

    /** React on updates of the AST in order to add/remove corresponding types from the type system, e.g. user-definied functions. */
    addedDomainElement(domainElement: unknown): void;
    updatedDomainElement(domainElement: unknown): void;
    removedDomainElement(domainElement: unknown): void;
}


export class NoTypesCreator implements TypeCreator {

    initialize(): void {
        // do nothing
    }

    addedDomainElement(_domainElement: unknown): void {
        // do nothing
    }

    updatedDomainElement(_domainElement: unknown): void {
        // do nothing
    }

    removedDomainElement(_domainElement: unknown): void {
        // do nothing
    }
}
