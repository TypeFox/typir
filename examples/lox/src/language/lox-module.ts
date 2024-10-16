/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { DefaultSharedCoreModuleContext, LangiumCoreServices, LangiumSharedCoreServices, Module, PartialLangiumCoreServices, createDefaultCoreModule, createDefaultSharedCoreModule, inject } from 'langium';
import { LoxGeneratedModule, LoxGeneratedSharedModule } from './generated/module.js';
import { LoxScopeProvider } from './lox-scope.js';
import { LoxValidationRegistry, LoxValidator } from './lox-validator.js';
import { DefaultSharedModuleContext, LangiumServices, LangiumSharedServices, createDefaultSharedModule } from 'langium/lsp';
import { createLangiumModuleForTypirBinding, initializeLangiumTypirServices, LangiumServicesForTypirBinding } from 'typir-langium';
import { createLoxTypirModule } from './type-system/lox-type-checking.js';
import { registerValidationChecks } from 'langium/grammar';

/**
 * Declaration of custom services - add your own service classes here.
 */
export type LoxAddedServices = {
    validation: {
        LoxValidator: LoxValidator
    }
}

/**
 * Union of Langium default services and your custom services - use this as constructor parameter
 * of custom service classes.
 */
export type LoxServices = LangiumServices & LoxAddedServices & LangiumServicesForTypirBinding

/**
 * Dependency injection module that overrides Langium default services and contributes the
 * declared custom services. The Langium defaults can be partially specified to override only
 * selected services, while the custom services must be fully specified.
 */
export const LoxModule: Module<LoxServices, PartialLangiumCoreServices & LoxAddedServices> = {
    validation: {
        ValidationRegistry: (services) => new LoxValidationRegistry(services),
        LoxValidator: () => new LoxValidator()
    },
    references: {
        ScopeProvider: (services) => new LoxScopeProvider(services)
    }
};

/**
 * Create the full set of services required by Langium.
 *
 * First inject the shared services by merging two modules:
 *  - Langium default shared services
 *  - Services generated by langium-cli
 *
 * Then inject the language-specific services by merging three modules:
 *  - Langium default language-specific services
 *  - Services generated by langium-cli
 *  - Services specified in this file
 *
 * @param context Optional module context with the LSP connection
 * @returns An object wrapping the shared services and the language-specific services
 */
export function createLoxServices(context: DefaultSharedModuleContext): {
    shared: LangiumSharedServices,
    Lox: LoxServices
} {
    const shared = inject(
        createDefaultSharedModule(context),
        LoxGeneratedSharedModule
    );
    const Lox = inject(
        createDefaultCoreModule({ shared }),
        LoxGeneratedModule,
        createLangiumModuleForTypirBinding(shared),
        LoxModule,
        createLoxTypirModule(shared),
    );
    shared.ServiceRegistry.register(Lox);
    initializeLangiumTypirServices(Lox);
    return { shared, Lox };
}
