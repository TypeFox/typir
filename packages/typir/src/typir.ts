/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeGraph } from './graph/type-graph.js';
import { DefaultTypeResolver, TypeResolvingService } from './initialization/type-selector.js';
import { BottomFactoryService, BottomKind } from './kinds/bottom/bottom-kind.js';
import { ClassFactoryService, ClassKind } from './kinds/class/class-kind.js';
import { FunctionKind, FunctionFactoryService } from './kinds/function/function-kind.js';
import { PrimitiveFactoryService, PrimitiveKind } from './kinds/primitive/primitive-kind.js';
import { TopFactoryService, TopKind } from './kinds/top/top-kind.js';
import { DefaultTypeAssignability, TypeAssignability } from './services/assignability.js';
import { DefaultDomainElementInferenceCaching, DefaultTypeRelationshipCaching, DomainElementInferenceCaching, TypeRelationshipCaching } from './services/caching.js';
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
    readonly assignability: TypeAssignability;
    readonly equality: TypeEquality;
    readonly conversion: TypeConversion;
    readonly subtype: SubType;
    readonly inference: TypeInferenceCollector;
    readonly caching: {
        readonly typeRelationships: TypeRelationshipCaching;
        readonly domainElementInference: DomainElementInferenceCaching;
    };
    readonly graph: TypeGraph;
    readonly kinds: KindRegistry;
    readonly printer: ProblemPrinter;
    readonly validation: {
        readonly collector: ValidationCollector;
        readonly constraints: ValidationConstraints;
    };
    readonly factory: {
        readonly primitives: PrimitiveFactoryService;
        readonly functions: FunctionFactoryService;
        readonly classes: ClassFactoryService;
        readonly top: TopFactoryService;
        readonly bottom: BottomFactoryService;
        readonly operators: OperatorFactoryService;
    };
    readonly infrastructure: {
        typeResolver: TypeResolvingService;
    },
};

export const DefaultTypirServiceModule: Module<TypirServices> = {
    assignability: (services) => new DefaultTypeAssignability(services),
    equality: (services) => new DefaultTypeEquality(services),
    conversion: (services) => new DefaultTypeConversion(services),
    graph: () =>  new TypeGraph(),
    subtype: (services) => new DefaultSubType(services),
    inference: (services) => new DefaultTypeInferenceCollector(services),
    caching: {
        typeRelationships: (services) => new DefaultTypeRelationshipCaching(services),
        domainElementInference: () => new DefaultDomainElementInferenceCaching()
    },
    kinds: () => new DefaultKindRegistry(),
    printer: () => new DefaultTypeConflictPrinter(),
    validation: {
        collector: (services) => new DefaultValidationCollector(services),
        constraints: (services) => new DefaultValidationConstraints(services),
    },
    factory: {
        primitives: (services) => new PrimitiveKind(services),
        functions: (services) => new FunctionKind(services),
        classes: (services) => new ClassKind(services, { typing: 'Nominal' }),
        top: (services) => new TopKind(services),
        bottom: (services) => new BottomKind(services),
        operators: (services) => new DefaultOperatorFactory(services),
    },
    infrastructure: {
        typeResolver: (services) => new DefaultTypeResolver(services),
    }
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
