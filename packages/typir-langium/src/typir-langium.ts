/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { LangiumSharedServices } from 'langium/lsp';
import { DeepPartial, DefaultTypirServiceModule, Module, TypirServices } from 'typir';
import { LangiumDomainElementInferenceCaching, LangiumTypeRelationshipCaching } from './features/langium-caching.js';
import { LangiumProblemPrinter } from './features/langium-printing.js';
import { IncompleteLangiumTypeCreator, LangiumTypeCreator } from './features/langium-type-creator.js';
import { LangiumTypirValidator } from './features/langium-validation.js';

/**
 * Additional Typir-Langium services to manage the Typir services
 * in order to be used e.g. for scoping/linking in Langium.
 */
export type TypirLangiumServices = {
    readonly TypeValidation: LangiumTypirValidator,
    readonly TypeCreator: LangiumTypeCreator,
}

export type LangiumServicesForTypirBinding = TypirServices & TypirLangiumServices

export type PartialTypirLangiumServices = DeepPartial<LangiumServicesForTypirBinding>

/**
 * Contains all customizations of Typir to simplify type checking for DSLs developed with Langium,
 * the language workbench for textual domain-specific languages (DSLs) in the web (https://langium.org/).
 */
export function createLangiumModuleForTypirBinding(langiumServices: LangiumSharedServices): Module<LangiumServicesForTypirBinding> {
    return {
        // use all core Typir services:
        ...DefaultTypirServiceModule,
        // replace some of the core Typir default implementations for Langium:
        printer: () => new LangiumProblemPrinter(),
        caching: {
            typeRelationships: (typirServices) => new LangiumTypeRelationshipCaching(typirServices),
            domainElementInference: () => new LangiumDomainElementInferenceCaching(langiumServices),
        },
        // provide implementations for the additional services for the Typir-Langium-binding:
        TypeValidation: (typirServices) => new LangiumTypirValidator(typirServices),
        TypeCreator: (typirServices) => new IncompleteLangiumTypeCreator(typirServices, langiumServices),
    };
}
