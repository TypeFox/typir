/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { AbstractAstReflection, AstNode, LangiumDefaultCoreServices, LangiumSharedCoreServices } from 'langium';
import { createDefaultTypirServicesModule, DeepPartial, inject, Module, PartialTypirServices, TypirServices } from 'typir';
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
export type TypirLangiumAddedServices<AstTypes extends LangiumAstTypes> = {
    readonly Inference: LangiumTypeInferenceCollector<AstTypes>; // concretizes the TypeInferenceCollector for Langium
    readonly langium: { // all new services which are specific for Langium
        readonly LangiumServices: LangiumSharedCoreServices; // store the Langium services to make them available for all Typir services
        readonly TypeCreator: LangiumTypeCreator;
        readonly TypeSystemDefinition: LangiumTypeSystemDefinition<AstTypes>;
    };
    readonly validation: {
        readonly Collector: LangiumValidationCollector<AstTypes>; // concretizes the ValidationCollector for Langium
        readonly TypeValidation: LangiumTypirValidator; // new service to integrate the validations into the Langium infrastructure
    };
}

export type TypirLangiumServices<AstTypes extends LangiumAstTypes> = TypirServices<AstNode> & TypirLangiumAddedServices<AstTypes>

export type PartialTypirLangiumServices<AstTypes extends LangiumAstTypes> = DeepPartial<TypirLangiumServices<AstTypes>>


/**
 * Creates a module that replaces some implementations of the core Typir services in order to be used with Langium.
 * @param langiumServices Typir-Langium needs to interact with the Langium lifecycle
 * @returns (only) the replaced implementations
 */
export function createLangiumSpecificTypirServicesModule<AstTypes extends LangiumAstTypes>(_langiumServices: LangiumSharedCoreServices): Module<TypirLangiumServices<AstTypes>, PartialTypirServices<AstNode>> {
    return {
        Printer: () => new LangiumProblemPrinter(),
        Language: () => { throw new Error('Use new LangiumLanguageService(undefined), and replace "undefined" by the generated XXXAstReflection!'); }, // to be replaced later
        caching: {
            LanguageNodeInference: (typirServices) => new LangiumLanguageNodeInferenceCaching(typirServices),
        },
    };
}

/**
 * Creates a module that provides a default implementation for each of the additional Typir-Langium services.
 * @param langiumServices Typir-Langium needs to interact with the Langium lifecycle
 * @returns an implementation for each of the additional Tyir-Langium services
 */
export function createDefaultTypirLangiumServicesModule<AstTypes extends LangiumAstTypes>(langiumServices: LangiumSharedCoreServices): Module<TypirLangiumServices<AstTypes>, TypirLangiumAddedServices<AstTypes>> {
    return {
        Inference: (typirServices) => new DefaultLangiumTypeInferenceCollector(typirServices),
        langium: {
            LangiumServices: () => langiumServices,
            TypeCreator: (typirServices) => new DefaultLangiumTypeCreator(typirServices),
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
 * @param customization3 some optional customizations of the Typir-Langium and Typir(-core) services, e.g. for testing
 * @returns the Typir services configured for the current Langium-based language
 */
export function createTypirLangiumServices<AstTypes extends LangiumAstTypes>(
    langiumServices: LangiumSharedCoreServices,
    reflection: AbstractAstReflection,
    typeSystemDefinition: LangiumTypeSystemDefinition<AstTypes>,
    customization1?: Module<PartialTypirLangiumServices<AstTypes>>,
    customization2?: Module<PartialTypirLangiumServices<AstTypes>>,
    customization3?: Module<PartialTypirLangiumServices<AstTypes>>,
): TypirLangiumServices<AstTypes> {
    return inject(
        // use the default implementations for all core Typir services ...
        createDefaultTypirServicesModule<AstNode>(),
        // ... with adapted implementations for Typir-Langium
        createLangiumSpecificTypirServicesModule<AstTypes>(langiumServices),
        // add the additional services for the Typir-Langium binding
        createDefaultTypirLangiumServicesModule<AstTypes>(langiumServices),
        // add the language-specific parts provided by Langium into the Typir-Services
        <Module<PartialTypirLangiumServices<AstTypes>>>{
            langium: {
                TypeSystemDefinition: () => typeSystemDefinition,
            },
            Language: () => new LangiumLanguageService(reflection),
        },
        // optionally add some more language-specific customization, e.g. for ...
        customization1, // ... production
        customization2, // ... testing (in order to replace some customizations of production)
        customization3, // ... testing (e.g. to have customizations for all test cases and for single test cases)
    );
}

// TODO Review: Is it possible to merge/unify these two functions in a nice way?

/**
 * This is the entry point to create Typir-Langium services to simplify type checking for DSLs developed with Langium,
 * the language workbench for textual domain-specific languages (DSLs) in the web (https://langium.org/).
 * Additionally, some new services are defined, and implementations for them are registered.
 * @param langiumServices Typir-Langium needs to interact with the Langium lifecycle
 * @param reflection Typir-Langium needs to know the existing AstNode$.types in order to do some performance optimizations
 * @param typeSystemDefinition the actual definition of the type system
 * @param moduleForAdditionalServices contains the configurations for all added services
 * @param customization1 some optional customizations of the Typir-Langium and Typir(-core) services, e.g. for production
 * @param customization2 some optional customizations of the Typir-Langium and Typir(-core) services, e.g. for testing
 * @param customization3 some optional customizations of the Typir-Langium and Typir(-core) services, e.g. for testing
 * @returns the Typir services configured for the current Langium-based language
 */
export function createTypirLangiumServicesWithAdditionalServices<AstTypes extends LangiumAstTypes, AdditionalServices>(
    langiumServices: LangiumSharedCoreServices,
    reflection: AbstractAstReflection,
    typeSystemDefinition: LangiumTypeSystemDefinition<AstTypes>,
    moduleForAdditionalServices: Module<TypirLangiumServices<AstTypes> & AdditionalServices, AdditionalServices>,
    customization1?: Module<TypirLangiumServices<AstTypes> & AdditionalServices, DeepPartial<TypirLangiumServices<AstTypes> & AdditionalServices>>,
    customization2?: Module<TypirLangiumServices<AstTypes> & AdditionalServices, DeepPartial<TypirLangiumServices<AstTypes> & AdditionalServices>>,
    customization3?: Module<TypirLangiumServices<AstTypes> & AdditionalServices, DeepPartial<TypirLangiumServices<AstTypes> & AdditionalServices>>,
): TypirLangiumServices<AstTypes> & AdditionalServices {
    return inject(
        // use the default implementations for all core Typir services ...
        createDefaultTypirServicesModule<AstNode>(),
        // ... with adapted implementations for Typir-Langium
        createLangiumSpecificTypirServicesModule<AstTypes>(langiumServices),
        // add the additional services for the Typir-Langium binding
        createDefaultTypirLangiumServicesModule<AstTypes>(langiumServices),
        // add the language-specific parts provided by Langium into the Typir-Services
        <Module<PartialTypirLangiumServices<AstTypes>>>{
            langium: {
                TypeSystemDefinition: () => typeSystemDefinition,
            },
            Language: () => new LangiumLanguageService(reflection),
        },
        // add implementations for all additional services
        moduleForAdditionalServices,
        // optionally add some more language-specific customization, e.g. for ...
        customization1, // ... production
        customization2, // ... testing (in order to replace some customizations of production)
        customization3, // ... testing (e.g. to have customizations for all test cases and for single test cases)
    );
}


export function initializeLangiumTypirServices<AstTypes extends LangiumAstTypes>(langiumServices: LangiumDefaultCoreServices, typirServices: TypirLangiumServices<AstTypes>): void {
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
