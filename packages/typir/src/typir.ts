/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { DefaultGraphAlgorithms, GraphAlgorithms } from './graph/graph-algorithms.js';
import { TypeGraph } from './graph/type-graph.js';
import { DefaultTypeResolver, TypeResolvingService } from './initialization/type-descriptor.js';
import { BottomFactoryService, BottomKind, BottomKindName } from './kinds/bottom/bottom-kind.js';
import { ClassFactoryService, ClassKind, ClassKindName } from './kinds/class/class-kind.js';
import { FunctionFactoryService, FunctionKind, FunctionKindName } from './kinds/function/function-kind.js';
import { PrimitiveFactoryService, PrimitiveKind, PrimitiveKindName } from './kinds/primitive/primitive-kind.js';
import { TopFactoryService, TopKind, TopKindName } from './kinds/top/top-kind.js';
import { DefaultTypeAssignability, TypeAssignability } from './services/assignability.js';
import { DefaultLanguageNodeInferenceCaching, DefaultTypeRelationshipCaching, LanguageNodeInferenceCaching, TypeRelationshipCaching } from './services/caching.js';
import { DefaultTypeConversion, TypeConversion } from './services/conversion.js';
import { DefaultTypeEquality, TypeEquality } from './services/equality.js';
import { DefaultTypeInferenceCollector, TypeInferenceCollector } from './services/inference.js';
import { DefaultKindRegistry, KindRegistry } from './services/kind-registry.js';
import { DefaultLanguageService, LanguageService } from './services/language.js';
import { DefaultOperatorFactory, OperatorFactoryService } from './services/operator.js';
import { DefaultTypeConflictPrinter, ProblemPrinter } from './services/printing.js';
import { DefaultSubType, SubType } from './services/subtype.js';
import { DefaultValidationCollector, DefaultValidationConstraints, ValidationCollector, ValidationConstraints, ValidationMessageProperties } from './services/validation.js';
import { inject, Module } from './utils/dependency-injection.js';
import { DeepPartial } from './utils/utils.js';

/* eslint-disable @typescript-eslint/indent */
/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * Some design decisions for Typir:
 * - We don't use a graph library like graphology to realize the type graph in order to be more flexible and to reduce external dependencies.
 * - Where should inference rules be stored? Inference rules are stored in the central service, optionally bound to types in order to simplify removal of deleted types.
 *   Inference rules are not linked to kinds (at least for now), since different types (of the same kind) might have different inference rules.
 * - No NameProvider for the name of types, since the name depends on the type of the kind => change the implementation of the kind.
 * - The type 'void' has a primitive kind (no dedicated kind for now).
 * - Once created/initialized, types are constant, e.g. no additional fields can be added to classes (but their types might be resolved a bit later).
 * - It is possible to use two different Typir instances side-by-side within the same application in general,
 *   since the services are not realized by global functions, but by methods of classes which implement service interfaces.
 */

export type TypirServices<Specifics extends TypirSpecifics> = {
    readonly Assignability: TypeAssignability;
    readonly Equality: TypeEquality;
    readonly Conversion: TypeConversion;
    readonly Subtype: SubType;
    readonly Inference: TypeInferenceCollector<Specifics>;
    readonly caching: {
        readonly TypeRelationships: TypeRelationshipCaching;
        readonly LanguageNodeInference: LanguageNodeInferenceCaching;
    };
    readonly Printer: ProblemPrinter<Specifics>;
    readonly Language: LanguageService<Specifics>;
    readonly validation: {
        readonly Collector: ValidationCollector<Specifics>;
        readonly Constraints: ValidationConstraints<Specifics>;
    };
    readonly factory: {
        readonly Primitives: PrimitiveFactoryService<Specifics>;
        readonly Functions: FunctionFactoryService<Specifics>;
        readonly Classes: ClassFactoryService<Specifics>;
        readonly Top: TopFactoryService<Specifics>;
        readonly Bottom: BottomFactoryService<Specifics>;
        readonly Operators: OperatorFactoryService<Specifics>;
    };
    readonly infrastructure: {
        readonly Graph: TypeGraph;
        readonly GraphAlgorithms: GraphAlgorithms;
        readonly Kinds: KindRegistry<Specifics>;
        readonly TypeResolver: TypeResolvingService<Specifics>;
    };
};

export function createDefaultTypirServicesModule<Specifics extends TypirSpecifics>(): Module<TypirServices<Specifics>> {
    return {
        Assignability: (services) => new DefaultTypeAssignability(services),
        Equality: (services) => new DefaultTypeEquality(services),
        Conversion: (services) => new DefaultTypeConversion(services),
        Subtype: (services) => new DefaultSubType(services),
        Inference: (services) => new DefaultTypeInferenceCollector(services),
        caching: {
            TypeRelationships: (services) => new DefaultTypeRelationshipCaching(services),
            LanguageNodeInference: () => new DefaultLanguageNodeInferenceCaching(),
        },
        Printer: () => new DefaultTypeConflictPrinter(),
        Language: () => new DefaultLanguageService(),
        validation: {
            Collector: (services) => new DefaultValidationCollector(services),
            Constraints: (services) => new DefaultValidationConstraints(services),
        },
        factory: {
            Primitives: (services) => services.infrastructure.Kinds.getOrCreateKind(PrimitiveKindName, services => new PrimitiveKind(services)),
            Functions: (services) => services.infrastructure.Kinds.getOrCreateKind(FunctionKindName, services => new FunctionKind(services)),
            Classes: (services) => services.infrastructure.Kinds.getOrCreateKind(ClassKindName, services => new ClassKind(services, { typing: 'Nominal' })),
            Top: (services) => services.infrastructure.Kinds.getOrCreateKind(TopKindName, services => new TopKind(services)),
            Bottom: (services) => services.infrastructure.Kinds.getOrCreateKind(BottomKindName, services => new BottomKind(services)),
            Operators: (services) => new DefaultOperatorFactory(services),
        },
        infrastructure: {
            Graph: () => new TypeGraph(),
            GraphAlgorithms: (services) => new DefaultGraphAlgorithms(services),
            Kinds: (services) => new DefaultKindRegistry(services),
            TypeResolver: (services) => new DefaultTypeResolver(services),
        },
    };
}

/**
 * Creates the TypirServices with the default module containing the default implements for Typir,
 * which might be exchanged by the given optional customized modules.
 * @param customization1 optional Typir module with customizations
 * @param customization2 optional Typir module with customizations
 * @param customization3 optional Typir module with customizations
 * @param customization4 optional Typir module with customizations
 * @returns a Typir instance, i.e. the TypirServices with implementations for all services
 */
export function createTypirServices<Specifics extends TypirSpecifics>(
    customization1?: Module<TypirServices<Specifics>, PartialTypirServices<Specifics>>,
    customization2?: Module<TypirServices<Specifics>, PartialTypirServices<Specifics>>,
    customization3?: Module<TypirServices<Specifics>, PartialTypirServices<Specifics>>,
    customization4?: Module<TypirServices<Specifics>, PartialTypirServices<Specifics>>,
): TypirServices<Specifics> {
    return inject(
        // use the default implementations for all core Typir services
        createDefaultTypirServicesModule<Specifics>(),
        // optionally add some more language-specific customization, e.g. for ...
        customization1, // ... production
        customization2, // ... testing (in order to replace some customizations of production)
        customization3, // ... testing (e.g. to have customizations for all test cases and for single test cases)
        customization4, // ... for even more flexibility
    );
}

/**
 * Creates the TypirServices with the default module containing the default implementations for Typir,
 * which might be exchanged by the given optional customized modules.
 * Additionally, some new services are defined, and implementations for them are registered.
 * @param moduleForAdditionalServices contains the configurations for all added services
 * @param customization1 optional Typir module with customizations (for new and existing services)
 * @param customization2 optional Typir module with customizations (for new and existing services)
 * @param customization3 optional Typir module with customizations (for new and existing services)
 * @param customization4 optional Typir module with customizations (for new and existing services)
 * @returns a Typir instance, i.e. the TypirServices consisting of the default services and the added services,
 * with implementations for all services
 */
export function createTypirServicesWithAdditionalServices<Specifics extends TypirSpecifics, AdditionalServices>(
    moduleForAdditionalServices: Module<TypirServices<Specifics> & AdditionalServices, AdditionalServices>,
    customization1?: Module<TypirServices<Specifics> & AdditionalServices, DeepPartial<TypirServices<Specifics> & AdditionalServices>>,
    customization2?: Module<TypirServices<Specifics> & AdditionalServices, DeepPartial<TypirServices<Specifics> & AdditionalServices>>,
    customization3?: Module<TypirServices<Specifics> & AdditionalServices, DeepPartial<TypirServices<Specifics> & AdditionalServices>>,
    customization4?: Module<TypirServices<Specifics> & AdditionalServices, DeepPartial<TypirServices<Specifics> & AdditionalServices>>,
): TypirServices<Specifics> & AdditionalServices {
    return inject(
        // use the default implementations for all core Typir services
        createDefaultTypirServicesModule<Specifics>(),
        // add implementations for all additional services
        moduleForAdditionalServices,
        // optionally add some more language-specific customization, e.g. for ...
        customization1, // ... production
        customization2, // ... testing (in order to replace some customizations of production)
        customization3, // ... testing (e.g. to have customizations for all test cases and for single test cases)
        customization4, // ... for even more flexibility
    );
}


/**
 * Language-specific services to be partially overridden via dependency injection.
 */
export type PartialTypirServices<Specifics extends TypirSpecifics> = DeepPartial<TypirServices<Specifics>>


/**
 * This type collects all TypeScript types which might be customized by applications or bindings for language workbenches.
 */
export interface TypirSpecifics {
    /** This is the TypeScript super-class of all language nodes in the AST */
    LanguageType: unknown;

    /** The set of available language keys:
     * Each language key maps to the TypeScript type (which extends 'LanguageType') of corresponding language nodes with this language key. */
    LanguageKeys: Record<string, unknown>;

    /** Properties for validation issues (predefined and custom ones) */
    ValidationMessageProperties: ValidationMessageProperties;
}


/** This type describes a single language key as defined in the given TypirSpecifics, or just `string`, if the keys are not specified. */
export type LanguageKey<Specifics extends TypirSpecifics> = keyof Specifics['LanguageKeys'];

/** This type allows to specify an arbitrary number of (maybe typed) language keys. */
export type LanguageKeys<Specifics extends TypirSpecifics> = LanguageKey<Specifics> | Array<LanguageKey<Specifics>> | undefined;

/** Given some language keys, this type provides the TypeScript types of the corresponding language nodes. */
export type LanguageTypeOfLanguageKey<
    Specifics extends TypirSpecifics,
    Keys extends LanguageKeys<Specifics>
> =
    // no key => use the base language type
    Keys extends undefined ? Specifics['LanguageType'] :
    // single key => use the specified language type from the "list type"
    Keys extends keyof Specifics['LanguageKeys'] ? Specifics['LanguageKeys'][Keys] :
    // multiple keys => use the base language type (as fall-back for now)
    Keys extends Array<infer GivenKeys> ? Specifics['LanguageType'] : // possible extension: calculate the union of language types
    never;

/** Given the type of a language node (i.e. the "language type"), this type provides the relevant properties of the language type. */
// possible extension: make this type exchangable, if possible
export type PropertiesOfLanguageType<Specifics extends TypirSpecifics, T extends Specifics['LanguageType'] | undefined = Specifics['LanguageType']> =
    T extends Specifics['LanguageType']
        ? keyof Omit<T, // some properties are not usable:
            | keyof Specifics['LanguageType'] // all properties from the base type => only the specific properties of the concrete language type remain
            | number | symbol
        >
        : never
;
