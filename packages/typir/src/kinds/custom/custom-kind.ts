/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type, TypeDetails } from '../../graph/type-node.js';
import { TypeInitializer } from '../../initialization/type-initializer.js';
import { TypeReference } from '../../initialization/type-reference.js';
import { ConversionMode } from '../../services/conversion.js';
import { TypirServices, TypirSpecifics } from '../../typir.js';
import { InferCurrentTypeRule } from '../../utils/utils-definitions.js';
import { isMap, isSet } from '../../utils/utils.js';
import { Kind } from '../kind.js';
import { CustomTypeInitialization, CustomTypeProperties, CustomTypePropertyInitialization, CustomTypePropertyTypes, CustomTypeStorage, TypeDescriptorForCustomTypes } from './custom-definitions.js';
import { CustomTypeInitializer } from './custom-initializer.js';
import { CustomType } from './custom-type.js';

export interface CustomKindOptions<Properties extends CustomTypeProperties, Specifics extends TypirSpecifics> {
    /** Name for this custom kind. The names of custom kinds are unique. */
    name: string;

    /** This identifier needs to consider all properties which make the custom type unique. The identifiers are used to detect unique custom types.
     * The default implementation considers all properties and their structure in a straight-forward way,
     * but does not guarantee unique identifiers in all cases in general, since string properties might contain values looking like identifiers of other properties.
     * The default implementation can be customized in order to overcome this limitation or to produce better readable identifiers.
     * It is the responsibility of the user of Typir to consider all relevant properties and their structure/nesting. */
    calculateTypeIdentifier?: (properties: CustomTypeInitialization<Properties, Specifics>) => string;

    /** Define the name for each custom type; might be overridden by the custom type-specific name.
     * If undefined, the identifier is used instead. */
    calculateTypeName?: (properties: CustomTypeStorage<Properties, Specifics>) => string;
    /** Define the user representation for each custom type; might be overridden by the custom type-specific user representation. */
    calculateTypeUserRepresentation?: (properties: CustomTypeStorage<Properties, Specifics>) => string;

    // SubType
    getSubTypesOfNewCustomType?: (superNewCustom: CustomType<Properties, Specifics>) => Type[];
    getSuperTypesOfNewCustomType?: (subNewCustom: CustomType<Properties, Specifics>) => Type[];
    isNewCustomTypeSubTypeOf?: (subNewCustom: CustomType<Properties, Specifics>, superOther: Type) => boolean;
    isNewCustomTypeSuperTypeOf?: (subOther: Type, superNewCustom: CustomType<Properties, Specifics>) => boolean;

    // Conversion
    getNewCustomTypeImplicitlyConvertibleToTypes?: (fromNewCustom: CustomType<Properties, Specifics>) => Type[];
    getTypesImplicitlyConvertibleToNewCustomType?: (toNewCustom: CustomType<Properties, Specifics>) => Type[];
    getNewCustomTypeExplicitlyConvertibleToTypes?: (fromNewCustom: CustomType<Properties, Specifics>) => Type[];
    getTypesExplicitlyConvertibleToNewCustomType?: (toNewCustom: CustomType<Properties, Specifics>) => Type[];
    isNewCustomTypeConvertibleToType?: (fromNewCustom: CustomType<Properties, Specifics>, toOther: Type) => ConversionMode;
    isTypeConvertibleToNewCustomType?: (fromOther: Type, toNewCustom: CustomType<Properties, Specifics>) => ConversionMode;
    // in order to have linear effort (instead of square effort), these methods are called only for the current, new CustomType (not for all existing types)!

    // TODO same for Equality in the future
}

export interface CustomTypeDetails<Properties extends CustomTypeProperties, Specifics extends TypirSpecifics> extends TypeDetails<Specifics> {
    /** Values for all custom properties of the custom type. Note that TypeDescriptor<A> are supported to initialize type properties of Type A. */
    properties: CustomTypeInitialization<Properties, Specifics>;
    /** If specified, overrides the kind-specific name for custom types. */
    typeName?: string;
    /** If specified, overrides the kind-specific user representation for custom types. */
    typeUserRepresentation?: string;
}

export interface CreateCustomTypeDetails<Properties extends CustomTypeProperties, Specifics extends TypirSpecifics> extends CustomTypeDetails<Properties, Specifics> {
    inferenceRules: Array<InferCurrentTypeRule<CustomType<Properties, Specifics>, Specifics>>;
}

export interface CustomFactoryService<Properties extends CustomTypeProperties, Specifics extends TypirSpecifics> {
    create(typeDetails: CustomTypeDetails<Properties, Specifics>): CustomTypeConfigurationChain<Properties, Specifics>;
    get(properties: CustomTypeInitialization<Properties, Specifics>): TypeReference<CustomType<Properties, Specifics>, Specifics>;
}

export interface CustomTypeConfigurationChain<Properties extends CustomTypeProperties, Specifics extends TypirSpecifics> {
    inferenceRule<T extends Specifics['LanguageType']>(rule: InferCurrentTypeRule<CustomType<Properties, Specifics>, Specifics, T>): CustomTypeConfigurationChain<Properties, Specifics>;
    finish(): TypeInitializer<CustomType<Properties, Specifics>, Specifics>;
}


export class CustomKind<Properties extends CustomTypeProperties, Specifics extends TypirSpecifics> implements Kind, CustomFactoryService<Properties, Specifics> {
    readonly $name: `CustomKind-${string}`;
    readonly services: TypirServices<Specifics>;
    readonly options: CustomKindOptions<Properties, Specifics>;

    constructor(services: TypirServices<Specifics>, options: CustomKindOptions<Properties, Specifics>) {
        this.$name = `CustomKind-${options.name}`;
        this.services = services;
        this.services.infrastructure.Kinds.register(this);
        this.options = this.collectOptions(options);
    }

    protected collectOptions(options: CustomKindOptions<Properties, Specifics>): CustomKindOptions<Properties, Specifics> {
        return {
            // no default options required here
            ...options,
        };
    }

    get(properties: CustomTypeInitialization<Properties, Specifics>): TypeReference<CustomType<Properties, Specifics>, Specifics> {
        return new TypeReference<CustomType<Properties, Specifics>, Specifics>(() => this.calculateIdentifier(properties), this.services);
    }

    create(typeDetails: CustomTypeDetails<Properties, Specifics>): CustomTypeConfigurationChain<Properties, Specifics> {
        return new CustomConfigurationChainImpl(this.services, this, typeDetails);
    }

    calculateIdentifier(properties: CustomTypeInitialization<Properties, Specifics>): string {
        if (this.options.calculateTypeIdentifier) {
            return this.options.calculateTypeIdentifier(properties);
        } else {
            return `custom-${this.options.name/*is unique for all custom kinds*/}-${this.calculateIdentifierAll(properties)}`;
        }
    }

    protected calculateIdentifierAll(properties: CustomTypeInitialization<Properties, Specifics>): string {
        return Object.entries(properties)
            .map(entry => `${entry[0]}:${this.calculateIdentifierSingle(entry[1])}`)
            .join(',');
    }
    protected calculateIdentifierSingle<T extends CustomTypePropertyTypes>(value: CustomTypePropertyInitialization<T, Specifics>): string {
        // all possible TypeDescriptors
        if (typeof value === 'function') {
            return this.services.infrastructure.TypeResolver.resolve(value as TypeDescriptorForCustomTypes<Type, Specifics>).getIdentifier();
        } else if (value instanceof Type
            || value instanceof TypeInitializer
            || value instanceof TypeReference
            || this.services.Language.isLanguageNode(value)
        ) {
            return this.services.infrastructure.TypeResolver.resolve(value).getIdentifier();
        }
        // grouping with Array, Set, Map
        else if (Array.isArray(value)) {
            return `[${value.map(content => this.calculateIdentifierSingle(content)).join(',')}]`;
        } else if (isSet(value)) {
            return `(${Array.from(value.entries()).map(content => this.calculateIdentifierSingle(content)).sort().join(',')})`; // stable order of elements required
        } else if (isMap(value)) {
            return `{${Array.from(value.entries()).sort((c1, c2) => (c1[0] as string).localeCompare(c2[0])).map(content => `${content[0]}=${this.calculateIdentifierSingle(content[1])}`).join(',')}}`; // stable order of elements required
        }
        // primitives
        else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint' || typeof value === 'symbol') {
            return String(value);
        } else if (value === undefined) { // required for optional properties
            return 'undefined';
        }
        // composite with recursive object / index signature
        else if (typeof value === 'object' && value !== null) {
            return this.calculateIdentifierAll(value as CustomTypeInitialization<Properties, Specifics>);
        } else {
            throw new Error(`missing implementation for '${value}'`);
        }
    }
}

export function isCustomKind<Properties extends CustomTypeProperties, Specifics extends TypirSpecifics>(kind: unknown): kind is CustomKind<Properties, Specifics> {
    return kind instanceof CustomKind;
}


class CustomConfigurationChainImpl<Properties extends CustomTypeProperties, Specifics extends TypirSpecifics> implements CustomConfigurationChainImpl<Properties, Specifics> {
    protected readonly services: TypirServices<Specifics>;
    protected readonly kind: CustomKind<Properties, Specifics>;
    protected readonly typeDetails: CreateCustomTypeDetails<Properties, Specifics>;

    constructor(services: TypirServices<Specifics>, kind: CustomKind<Properties, Specifics>, typeDetails: CustomTypeDetails<Properties, Specifics>) {
        this.services = services;
        this.kind = kind;
        this.typeDetails = {
            ...typeDetails,
            inferenceRules: [],
        };
    }

    inferenceRule<T extends Specifics['LanguageType']>(rule: InferCurrentTypeRule<CustomType<Properties, Specifics>, Specifics, T>): CustomConfigurationChainImpl<Properties, Specifics> {
        this.typeDetails.inferenceRules.push(rule as unknown as InferCurrentTypeRule<CustomType<Properties, Specifics>, Specifics>);
        return this;
    }

    finish(): TypeInitializer<CustomType<Properties, Specifics>, Specifics> {
        return new CustomTypeInitializer(this.kind, this.typeDetails);
    }
}
