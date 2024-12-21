/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { AbstractAstReflection, AstNode, DiagnosticInfo, LangiumDefaultCoreServices, LangiumSharedCoreServices } from 'langium';
import { createDefaultTypirServicesModule, DeepPartial, inject, Module, PartialTypirServices, TypirServices, TypirSpecifics } from 'typir';
import { LangiumLanguageNodeInferenceCaching } from './features/langium-caching.js';
import { DefaultLangiumTypeInferenceCollector, LangiumTypeInferenceCollector } from './features/langium-inference.js';
import { LangiumLanguageService } from './features/langium-language.js';
import { LangiumProblemPrinter } from './features/langium-printing.js';
import { DefaultLangiumTypeCreator, LangiumTypeCreator, LangiumTypeSystemDefinition } from './features/langium-type-creator.js';
import { DefaultLangiumTypirValidator, DefaultLangiumValidationCollector, LangiumTypirValidator, LangiumValidationCollector, registerTypirValidationChecks } from './features/langium-validation.js';
import { LangiumAstTypes } from './utils/typir-langium-utils.js';

/**
 * This type collects all TypeScript types which might be customized by applications of Typir-Langium.
 */
export interface TypirLangiumSpecifics extends TypirSpecifics {
    LanguageType: AstNode;      // concretizes the `LanguageType`, since all language nodes of a Langium AST are AstNode's
    AstTypes: LangiumAstTypes;  // applications should concretize the `AstTypes` with XXXAstType from the generated `ast.ts`
    /** Support also the Langium-specific diagnostic properties, e.g. to mark keywords or register code actions */
    ValidationMessageProperties: TypirSpecifics['ValidationMessageProperties'] & Omit<DiagnosticInfo<AstNode>, 'node'|'property'|'index'>; // 'node', 'property', and 'index' are already coverd by TypirSpecifics['ValidationMessageProperties'] with a different name
}

/**
 * Additional Typir-Langium services to manage the Typir services
 * in order to be used e.g. for scoping/linking in Langium.
 */
export type TypirLangiumAddedServices<Specifics extends TypirLangiumSpecifics> = {
    readonly Inference: LangiumTypeInferenceCollector<Specifics>; // concretizes the TypeInferenceCollector for Langium
    readonly langium: { // all new services which are specific for Langium
        readonly LangiumServices: LangiumSharedCoreServices; // store the Langium services to make them available for all Typir services
        readonly TypeCreator: LangiumTypeCreator;
        readonly TypeSystemDefinition: LangiumTypeSystemDefinition<Specifics>;
    };
    readonly validation: {
        readonly Collector: LangiumValidationCollector<Specifics>; // concretizes the ValidationCollector for Langium
        readonly TypeValidation: LangiumTypirValidator<Specifics>; // new service to integrate the validations into the Langium infrastructure
    };
}

export type TypirLangiumServices<Specifics extends TypirLangiumSpecifics> = TypirServices<Specifics> & TypirLangiumAddedServices<Specifics>

export type PartialTypirLangiumServices<Specifics extends TypirLangiumSpecifics> = DeepPartial<TypirLangiumServices<Specifics>>


/**
 * Creates a module that replaces some implementations of the core Typir services in order to be used with Langium.
 * @param _langiumServices Typir-Langium needs to interact with the Langium lifecycle
 * @returns (only) the replaced implementations
 */
export function createLangiumSpecificTypirServicesModule<Specifics extends TypirLangiumSpecifics>(_langiumServices: LangiumSharedCoreServices): Module<TypirLangiumServices<Specifics>, PartialTypirServices<Specifics>> {
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
export function createDefaultTypirLangiumServicesModule<Specifics extends TypirLangiumSpecifics>(langiumServices: LangiumSharedCoreServices): Module<TypirLangiumServices<Specifics>, TypirLangiumAddedServices<Specifics>> {
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
 * @param customization4 some optional customizations of the Typir-Langium and Typir(-core) services
 * @returns the Typir services configured for the current Langium-based language
 */
export function createTypirLangiumServices<Specifics extends TypirLangiumSpecifics>(
    langiumServices: LangiumSharedCoreServices,
    reflection: AbstractAstReflection,
    typeSystemDefinition: LangiumTypeSystemDefinition<Specifics>,
    customization1?: Module<PartialTypirLangiumServices<Specifics>>,
    customization2?: Module<PartialTypirLangiumServices<Specifics>>,
    customization3?: Module<PartialTypirLangiumServices<Specifics>>,
    customization4?: Module<PartialTypirLangiumServices<Specifics>>,
): TypirLangiumServices<Specifics> {
    return inject(
        // use the default implementations for all core Typir services ...
        createDefaultTypirServicesModule<Specifics>(),
        // ... with adapted implementations for Typir-Langium
        createLangiumSpecificTypirServicesModule<Specifics>(langiumServices),
        // add the additional services for the Typir-Langium binding
        createDefaultTypirLangiumServicesModule<Specifics>(langiumServices),
        // add the language-specific parts provided by Langium into the Typir-Services
        <Module<PartialTypirLangiumServices<Specifics>>>{
            langium: {
                TypeSystemDefinition: () => typeSystemDefinition,
            },
            Language: () => new LangiumLanguageService(reflection), // 'reflection' is only managed by the LanguageService by design
        },
        // optionally add some more language-specific customization, e.g. for ...
        customization1, // ... production
        customization2, // ... testing (in order to replace some customizations of production)
        customization3, // ... testing (e.g. to have customizations for all test cases and for single test cases)
        customization4, // ... for even more flexibility
    );
}

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
 * @param customization4 some optional customizations of the Typir-Langium and Typir(-core) services
 * @returns the Typir services configured for the current Langium-based language
 */
export function createTypirLangiumServicesWithAdditionalServices<Specifics extends TypirLangiumSpecifics, AdditionalServices>(
    langiumServices: LangiumSharedCoreServices,
    reflection: AbstractAstReflection,
    typeSystemDefinition: LangiumTypeSystemDefinition<Specifics>,
    moduleForAdditionalServices: Module<TypirLangiumServices<Specifics> & AdditionalServices, AdditionalServices>,
    customization1?: Module<TypirLangiumServices<Specifics> & AdditionalServices, DeepPartial<TypirLangiumServices<Specifics> & AdditionalServices>>,
    customization2?: Module<TypirLangiumServices<Specifics> & AdditionalServices, DeepPartial<TypirLangiumServices<Specifics> & AdditionalServices>>,
    customization3?: Module<TypirLangiumServices<Specifics> & AdditionalServices, DeepPartial<TypirLangiumServices<Specifics> & AdditionalServices>>,
    customization4?: Module<TypirLangiumServices<Specifics> & AdditionalServices, DeepPartial<TypirLangiumServices<Specifics> & AdditionalServices>>,
): TypirLangiumServices<Specifics> & AdditionalServices {
    return inject(
        // use the default implementations for all core Typir services ...
        createDefaultTypirServicesModule<Specifics>(),
        // ... with adapted implementations for Typir-Langium
        createLangiumSpecificTypirServicesModule<Specifics>(langiumServices),
        // add the additional services for the Typir-Langium binding
        createDefaultTypirLangiumServicesModule<Specifics>(langiumServices),
        // add the language-specific parts provided by Langium into the Typir-Services
        <Module<PartialTypirLangiumServices<Specifics>>>{
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
        customization4, // ... for even more flexibility
    );
}


export function initializeLangiumTypirServices<Specifics extends TypirLangiumSpecifics>(langiumServices: LangiumDefaultCoreServices, typirServices: TypirLangiumServices<Specifics>): void {
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
