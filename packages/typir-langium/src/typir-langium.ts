/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Module, PartialTypirServices, TypirServices, createTypirServices } from 'typir';
import { LangiumProblemPrinter } from './features/langium-printing.js';
import { LangiumTypirValidator } from './features/langium-validation.js';
import { LangiumDomainElementInferenceCaching, LangiumTypeRelationshipCaching } from './features/langium-caching.js';
import { LangiumSharedServices } from 'langium/lsp';

/**
 * Contains all customizations of Typir to simplify type checking for DSLs developed with Langium,
 * the language workbench for textual domain-specific languages (DSLs) in the web (https://langium.org/).
 */
export function createTypirLangiumModule(langiumServices: LangiumSharedServices): Module<TypirServices, PartialTypirServices> {
    return {
        printer: () => new LangiumProblemPrinter(),
        caching: {
            typeRelationships: (services) => new LangiumTypeRelationshipCaching(services),
            domainElementInference: () => new LangiumDomainElementInferenceCaching(langiumServices),
        }
    };
}


/** Additional Langium services to manage the Typir services/instance */
export type LangiumServicesForTypirBinding = {
    Typir: TypirServices,
    TypeValidation: LangiumTypirValidator,
}

/** The implementations for the additional Langium services of the Typir binding */
export function createLangiumModuleForTypirBinding(langiumServices: LangiumSharedServices, typirServices: Module<TypirServices, PartialTypirServices>): Module<LangiumServicesForTypirBinding> {
    return {
        Typir: () => createTypirServices(createTypirLangiumModule(langiumServices), typirServices), // TODO reset state during updates!
        TypeValidation: (services) => new LangiumTypirValidator(services),
    };
}

// TODO irgendwie ist das zirkulär geworden!
