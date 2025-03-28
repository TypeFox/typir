/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { AbstractAstReflection, AstNode, LangiumDefaultCoreServices, LangiumSharedCoreServices } from 'langium';
import { createDefaultTypirServiceModule, DeepPartial, inject, Module, PartialTypirServices, TypirServices } from 'typir';
import { LangiumLanguageNodeInferenceCaching } from './features/langium-caching.js';
import { DefaultLangiumTypeInferenceCollector, LangiumTypeInferenceCollector } from './features/langium-inference.js';
import { LangiumLanguageService } from './features/langium-language.js';
import { LangiumProblemPrinter } from './features/langium-printing.js';
import { DefaultLangiumTypeCreator, LangiumTypeCreator, LangiumTypeSystemDefinition } from './features/langium-type-creator.js';
import { DefaultLangiumTypirValidator, DefaultLangiumValidationCollector, LangiumTypirValidator, LangiumValidationCollector, registerTypirValidationChecks } from './features/langium-validation.js';
import { LangiumAstTypes } from './utils/typir-langium-utils.js';

/**
 * Additional Typir-Langium services to manage the Typir services
 * in order to be used e.g. for scoping/linking in Langium.
 */
export type TypirLangiumServices<AstTypes extends LangiumAstTypes> = {
    readonly Inference: LangiumTypeInferenceCollector<AstTypes>; // concretizes the TypeInferenceCollector for Langium
    readonly langium: { // new services which are specific for Langium
        readonly TypeCreator: LangiumTypeCreator;
        readonly TypeSystemDefinition: LangiumTypeSystemDefinition<AstTypes>;
    };
    readonly validation: {
        readonly Collector: LangiumValidationCollector<AstTypes>; // concretizes the ValidationCollector for Langium
        readonly TypeValidation: LangiumTypirValidator; // new service to integrate the validations into the Langium infrastructure
    };
}

export type LangiumServicesForTypirBinding<AstTypes extends LangiumAstTypes> = TypirServices<AstNode> & TypirLangiumServices<AstTypes>

export type PartialTypirLangiumServices<AstTypes extends LangiumAstTypes> = DeepPartial<LangiumServicesForTypirBinding<AstTypes>>

export function createLangiumSpecificTypirServicesModule(langiumServices: LangiumSharedCoreServices): Module<TypirServices<AstNode>> {
    // replace some implementations for the core Typir services
    const LangiumSpecifics: Module<TypirServices<AstNode>, PartialTypirServices<AstNode>> = {
        Printer: () => new LangiumProblemPrinter(),
        Language: () => { throw new Error('Use new LangiumLanguageService(undefined), and replace "undefined" by the generated XXXAstReflection!'); }, // to be replaced later
        caching: {
            LanguageNodeInference: () => new LangiumLanguageNodeInferenceCaching(langiumServices),
        },
    };
    return Module.merge(
        // use all core Typir services:
        createDefaultTypirServiceModule<AstNode>(),
        // replace some of the core Typir default implementations for Langium:
        LangiumSpecifics,
    );
}

export function createDefaultTypirLangiumServices<AstTypes extends LangiumAstTypes>(langiumServices: LangiumSharedCoreServices): Module<LangiumServicesForTypirBinding<AstTypes>, TypirLangiumServices<AstTypes>> {
    return {
        Inference: (typirServices) => new DefaultLangiumTypeInferenceCollector(typirServices),
        langium: {
            TypeCreator: (typirServices) => new DefaultLangiumTypeCreator(typirServices, langiumServices),
            TypeSystemDefinition: () => { throw new Error('The type system needs to be specified!'); }, // to be replaced later
        },
        validation: {
            Collector: (typirServices) => new DefaultLangiumValidationCollector(typirServices),
            TypeValidation: (typirServices) => new DefaultLangiumTypirValidator(typirServices),
        },
    };
}


/**
 * This is the entry point to create Typir-Langium services to simplify type checking for DSLs developed with Langium,
 * the language workbench for textual domain-specific languages (DSLs) in the web (https://langium.org/).
 * @param langiumServices Typir-Langium needs to interact with the Langium lifecycle
 * @param reflection Typir-Langium needs to know the existing AstNode$.types in order to do some performance optimizations
 * @param typeSystemDefinition the actual definition of the type system
 * @param customization1 some optional customizations of the Typir-Langium and Typir(-core) services, e.g. for production
 * @param customization2 some optional customizations of the Typir-Langium and Typir(-core) services, e.g. for testing
 * @returns the Typir services configured for the current Langium-based language
 */
export function createTypirLangiumServices<AstTypes extends LangiumAstTypes>(
    langiumServices: LangiumSharedCoreServices, reflection: AbstractAstReflection, typeSystemDefinition: LangiumTypeSystemDefinition<AstTypes>,
    customization1: Module<PartialTypirLangiumServices<AstTypes>> = {},
    customization2: Module<PartialTypirLangiumServices<AstTypes>> = {},
): LangiumServicesForTypirBinding<AstTypes> {
    return inject(
        // the core Typir services (with adapted implementations for Typir-Langium)
        createLangiumSpecificTypirServicesModule(langiumServices),
        // the additional services for the Typir-Langium binding (with implementations)
        createDefaultTypirLangiumServices<AstTypes>(langiumServices),
        // add the language-specific parts provided by Langium into the Typir-Services
        <Module<PartialTypirLangiumServices<AstTypes>>>{
            langium: {
                TypeSystemDefinition: () => typeSystemDefinition,
            },
            Language: () => new LangiumLanguageService(reflection),
        },
        // optionally add some more language-specific customization, e.g. for ...
        customization1, // ... production
        customization2, // ... and some more customizations for testing
    );
}

export function initializeLangiumTypirServices<AstTypes extends LangiumAstTypes>(langiumServices: LangiumDefaultCoreServices, typirServices: LangiumServicesForTypirBinding<AstTypes>): void {
    // register the type-related validations of Typir at the Langium validation registry
    registerTypirValidationChecks(langiumServices, typirServices);

    // initialize the type creation (this is not done automatically by dependency injection!)
    typirServices.langium.TypeCreator.triggerInitialization();

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

    // => improvements for the future
}
