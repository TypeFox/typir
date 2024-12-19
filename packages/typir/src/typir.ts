/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeGraph } from './graph/type-graph.js';
import { DefaultTypeResolver, TypeResolvingService } from './initialization/type-selector.js';
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
import { DefaultOperatorFactory, OperatorFactoryService } from './services/operator.js';
import { DefaultTypeConflictPrinter, ProblemPrinter } from './services/printing.js';
import { DefaultSubType, SubType } from './services/subtype.js';
import { DefaultValidationCollector, DefaultValidationConstraints, ValidationCollector, ValidationConstraints } from './services/validation.js';
import { inject, Module } from './utils/dependency-injection.js';

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

/** Some open design questions for future releases TODO
 * - Replace "unknown" as a generic "<T = unknown>" for whole Typir? For Typir-Langium T would be AstNode!
 * - How to bundle Typir configurations for reuse ("presets")?
 */

export type TypirServices = {
    readonly Assignability: TypeAssignability;
    readonly Equality: TypeEquality;
    readonly Conversion: TypeConversion;
    readonly Subtype: SubType;
    readonly Inference: TypeInferenceCollector;
    readonly caching: {
        readonly TypeRelationships: TypeRelationshipCaching;
        readonly LanguageNodeInference: LanguageNodeInferenceCaching;
    };
    readonly Printer: ProblemPrinter;
    readonly validation: {
        readonly Collector: ValidationCollector;
        readonly Constraints: ValidationConstraints;
    };
    readonly factory: {
        readonly Primitives: PrimitiveFactoryService;
        readonly Functions: FunctionFactoryService;
        readonly Classes: ClassFactoryService;
        readonly Top: TopFactoryService;
        readonly Bottom: BottomFactoryService;
        readonly Operators: OperatorFactoryService;
    };
    readonly infrastructure: {
        readonly Graph: TypeGraph;
        readonly Kinds: KindRegistry;
        readonly TypeResolver: TypeResolvingService;
    };
};

export const DefaultTypirServiceModule: Module<TypirServices> = {
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
        Graph: () =>  new TypeGraph(),
        Kinds: (services) => new DefaultKindRegistry(services),
        TypeResolver: (services) => new DefaultTypeResolver(services),
    },
};

/**
 * Creates the TypirServices with the default module containing the default implements for Typir, which might be exchanged by the given optional customized modules.
 * @param customization1 optional Typir module with customizations
 * @param customization2 optional Typir module with customizations
 * @returns a Typir instance, i.e. the TypirServices with implementations
 */
export function createTypirServices(
    customization1: Module<TypirServices, PartialTypirServices> = {},
    customization2: Module<TypirServices, PartialTypirServices> = {}
): TypirServices {
    return inject(DefaultTypirServiceModule, customization1, customization2);
}

/**
 * A deep partial type definition for services. We look into T to see whether its type definition contains
 * any methods. If it does, it's one of our services and therefore should not be partialized.
 * Copied from Langium.
 */
//eslint-disable-next-line @typescript-eslint/ban-types
export type DeepPartial<T> = T[keyof T] extends Function ? T : {
    [P in keyof T]?: DeepPartial<T[P]>;
}

/**
 * Language-specific services to be partially overridden via dependency injection.
 */
export type PartialTypirServices = DeepPartial<TypirServices>
