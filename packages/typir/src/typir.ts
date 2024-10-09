/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { inject, Module } from './utils/dependency-injection.js';
import { DefaultTypeAssignability, TypeAssignability } from './features/assignability.js';
import { DefaultDomainElementInferenceCaching, DefaultTypeRelationshipCaching, DomainElementInferenceCaching, TypeRelationshipCaching } from './features/caching.js';
import { DefaultTypeConversion, TypeConversion } from './features/conversion.js';
import { DefaultTypeEquality, TypeEquality } from './features/equality.js';
import { DefaultTypeInferenceCollector, TypeInferenceCollector } from './features/inference.js';
import { DefaultOperatorManager, OperatorManager } from './features/operator.js';
import { DefaultTypeConflictPrinter, ProblemPrinter } from './features/printing.js';
import { DefaultSubType, SubType } from './features/subtype.js';
import { DefaultValidationCollector, DefaultValidationConstraints, ValidationCollector, ValidationConstraints } from './features/validation.js';
import { TypeGraph } from './graph/type-graph.js';
import { KindRegistry, DefaultKindRegistry } from './kinds/kind-registry.js';

/**
 * Design decisions for Typir
 * - no NameProvider for the name of types, since the name depends on the type of the kind => change the implementation of the kind
 * - the type 'void' has a primitive kind (no dedicated kind for now)
 * - Once created/initialized, types are constant, e.g. no additional fields can be added to classes (but their types might be resolved a bit later).
 */

/** Open design questions TODO
 * - use graphology for the TypeGraph?
 * - Where should inference rules be stored? only in the central service? in types? in kinds?
 * - Type is generic VS there are specific types like FunctionType (extends Type)?? functionType.kind.getOutput(functionKind) + isFunctionKind() feels bad! vs functionType.getOutput() + isFunctionType()
 * - realize "unknown" as a generic "<T = unknown>" for whole Typir? for the Langium binding T would be AstNode!
 * - Is it easy to use two different Typir instances side-by-side within the same application?
 * - How to bundle Typir configurations for reuse ("presets")?
 * - How to handle cycles?
 *     - Cycles at types: MyClass { myField?: MyClass, myFunction(operand: MyClass) }, MyClass<T extends MyClass<T>> to return typed sub-class instances
 *     - Cycles at instances/objects: Parent used as Child?!
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
    readonly operators: OperatorManager;
    readonly printer: ProblemPrinter;
    readonly validation: {
        readonly collector: ValidationCollector;
        readonly constraints: ValidationConstraints;
    };
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
    operators: (services) => new DefaultOperatorManager(services),
    kinds: () => new DefaultKindRegistry(),
    printer: () => new DefaultTypeConflictPrinter(),
    validation: {
        collector: (services) => new DefaultValidationCollector(services),
        constraints: (services) => new DefaultValidationConstraints(services),
    }
};

export function createTypirServices(customization: Module<TypirServices, PartialTypirServices> = {}): TypirServices {
    return inject(DefaultTypirServiceModule, customization);
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
