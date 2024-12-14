/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { LangiumDefaultCoreServices, LangiumSharedCoreServices } from 'langium';
import { DeepPartial, DefaultTypirServiceModule, Module, PartialTypirServices, TypirServices } from 'typir';
import { LangiumDomainElementInferenceCaching } from './features/langium-caching.js';
import { LangiumProblemPrinter } from './features/langium-printing.js';
import { LangiumTypeCreator, PlaceholderLangiumTypeCreator } from './features/langium-type-creator.js';
import { DefaultLangiumTypirValidator, LangiumTypirValidator, registerTypirValidationChecks } from './features/langium-validation.js';

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

export function createLangiumSpecificTypirServicesModule(langiumServices: LangiumSharedCoreServices): Module<TypirServices> {
    // replace some implementations for the core Typir services
    const LangiumSpecifics: Module<TypirServices, PartialTypirServices> = {
        printer: () => new LangiumProblemPrinter(),
        caching: {
            domainElementInference: () => new LangiumDomainElementInferenceCaching(langiumServices),
        },
    };
    return Module.merge(
        // use all core Typir services:
        DefaultTypirServiceModule,
        // replace some of the core Typir default implementations for Langium:
        LangiumSpecifics
    );
}

export function createDefaultTypirLangiumServices(langiumServices: LangiumSharedCoreServices): Module<LangiumServicesForTypirBinding, TypirLangiumServices> {
    return {
        TypeValidation: (typirServices) => new DefaultLangiumTypirValidator(typirServices),
        TypeCreator: (typirServices) => new PlaceholderLangiumTypeCreator(typirServices, langiumServices),
    };
}

/**
 * Contains all customizations of Typir to simplify type checking for DSLs developed with Langium,
 * the language workbench for textual domain-specific languages (DSLs) in the web (https://langium.org/).
 */
export function createLangiumModuleForTypirBinding(langiumServices: LangiumSharedCoreServices): Module<LangiumServicesForTypirBinding> {
    return Module.merge(
        // the core Typir services (with adapted implementations for Typir-Langium)
        createLangiumSpecificTypirServicesModule(langiumServices),
        // the additional services for the Typir-Langium binding (with implementations)
        createDefaultTypirLangiumServices(langiumServices),
    );
}

export function initializeLangiumTypirServices(langiumServices: LangiumDefaultCoreServices, typirServices: LangiumServicesForTypirBinding): void {
    // register the type-related validations of Typir at the Langium validation registry
    registerTypirValidationChecks(langiumServices, typirServices);

    // initialize the type creation (this is not done automatically by dependency injection!)
    typirServices.TypeCreator.triggerInitialization();

    /*
    Don't use the following code ...
        services.shared.lsp.LanguageServer.onInitialized(_params => {
            services.TypeCreator.triggerInitialization();
        });
    ... since it requires a Language Server, which is not true in all cases, e.g. in test cases.
    Without this approach, the parameter "services: LangiumServices" can be relaxed to "services: LangiumDefaultCoreServices" to support non-LSP scenarios!
    */

    // maybe using services.shared.workspace.WorkspaceManager.initializeWorkspace/loadAdditionalDocuments
    // another idea is to use eagerLoad(inject(...)) when creating the services
}
