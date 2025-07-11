/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { isMap, isSet } from 'util/types';
import { Type, TypeDetails } from '../../graph/type-node.js';
import { TypeInitializer } from '../../initialization/type-initializer.js';
import { TypeReference } from '../../initialization/type-reference.js';
import { ConversionMode } from '../../services/conversion.js';
import { TypirServices } from '../../typir.js';
import { InferCurrentTypeRule } from '../../utils/utils-definitions.js';
import { Kind } from '../kind.js';
import { CustomTypeInitialization, CustomTypeProperties, CustomTypePropertyInitialization, CustomTypePropertyTypes, CustomTypeStorage, TypeSelectorForCustomTypes } from './custom-definitions.js';
import { CustomTypeInitializer } from './custom-initializer.js';
import { CustomType } from './custom-type.js';

export interface CustomKindOptions<Properties extends CustomTypeProperties, LanguageType> {
    /** Name for this custom kind. The names of custom kinds are unique. */
    name: string;

    /** This identifier needs to consider all properties which make the custom type unique. The identifiers are used to detect unique custom types.
     * The default implementation considers all properties and their structure in a straight-forward way,
     * but does not guarantee unique identifiers in all cases in general, since string properties might contain values looking like identifiers of other properties.
     * The default implementation can be customized in order to overcome this limitation or to produce better readable identifiers.
     * It is the responsibility of the user of Typir to consider all relevant properties and their structure/nesting. */
    calculateTypeIdentifier?: (properties: CustomTypeInitialization<Properties, LanguageType>) => string;

    /** Define the name for each custom type; might be overridden by the custom type-specific name.
     * If undefined, the identifier is used instead. */
    calculateTypeName?: (properties: CustomTypeStorage<Properties, LanguageType>) => string;
    /** Define the user representation for each custom type; might be overridden by the custom type-specific user representation. */
    calculateTypeUserRepresentation?: (properties: CustomTypeStorage<Properties, LanguageType>) => string;

    // SubType
    getSubTypesOfNewCustomType?: (superNewCustom: CustomType<Properties, LanguageType>) => Type[];
    getSuperTypesOfNewCustomType?: (subNewCustom: CustomType<Properties, LanguageType>) => Type[];
    isNewCustomTypeSubTypeOf?: (subNewCustom: CustomType<Properties, LanguageType>, superOther: Type) => boolean;
    isNewCustomTypeSuperTypeOf?: (subOther: Type, superNewCustom: CustomType<Properties, LanguageType>) => boolean;

    // Conversion
    getNewCustomTypeImplicitlyConvertibleToTypes?: (fromNewCustom: CustomType<Properties, LanguageType>) => Type[];
    getTypesImplicitlyConvertibleToNewCustomType?: (toNewCustom: CustomType<Properties, LanguageType>) => Type[];
    getNewCustomTypeExplicitlyConvertibleToTypes?: (fromNewCustom: CustomType<Properties, LanguageType>) => Type[];
    getTypesExplicitlyConvertibleToNewCustomType?: (toNewCustom: CustomType<Properties, LanguageType>) => Type[];
    isNewCustomTypeConvertibleToType?: (fromNewCustom: CustomType<Properties, LanguageType>, toOther: Type) => ConversionMode;
    isTypeConvertibleToNewCustomType?: (fromOther: Type, toNewCustom: CustomType<Properties, LanguageType>) => ConversionMode;
    // in order to have linear effort (instead of square effort), these methods are called only for the current, new CustomType (not for all existing types)!

    // TODO same for Equality in the future
}

export interface CustomTypeDetails<Properties extends CustomTypeProperties, LanguageType> extends TypeDetails<LanguageType> {
    /** Values for all custom properties of the custom type. Note that TypeSelector<A> are supported to initialize type properties of Type A. */
    properties: CustomTypeInitialization<Properties, LanguageType>;
    /** If specified, overrides the kind-specific name for custom types. */
    typeName?: string;
    /** If specified, overrides the kind-specific user representation for custom types. */
    typeUserRepresentation?: string;
}

export interface CreateCustomTypeDetails<Properties extends CustomTypeProperties, LanguageType> extends CustomTypeDetails<Properties, LanguageType> {
    inferenceRules: Array<InferCurrentTypeRule<CustomType<Properties, LanguageType>, LanguageType>>;
}

export interface CustomFactoryService<Properties extends CustomTypeProperties, LanguageType> {
    create(typeDetails: CustomTypeDetails<Properties, LanguageType>): CustomTypeConfigurationChain<Properties, LanguageType>;
    get(properties: CustomTypeInitialization<Properties, LanguageType>): TypeReference<CustomType<Properties, LanguageType>, LanguageType>;
}

export interface CustomTypeConfigurationChain<Properties extends CustomTypeProperties, LanguageType> {
    inferenceRule<T extends LanguageType>(rule: InferCurrentTypeRule<CustomType<Properties, LanguageType>, LanguageType, T>): CustomTypeConfigurationChain<Properties, LanguageType>;
    finish(): TypeInitializer<CustomType<Properties, LanguageType>, LanguageType>;
}


export class CustomKind<Properties extends CustomTypeProperties, LanguageType> implements Kind, CustomFactoryService<Properties, LanguageType> {
    readonly $name: `CustomKind-${string}`;
    readonly services: TypirServices<LanguageType>;
    readonly options: CustomKindOptions<Properties, LanguageType>;

    constructor(services: TypirServices<LanguageType>, options: CustomKindOptions<Properties, LanguageType>) {
        this.$name = `CustomKind-${options.name}`;
        this.services = services;
        this.services.infrastructure.Kinds.register(this);
        this.options = this.collectOptions(options);
    }

    protected collectOptions(options: CustomKindOptions<Properties, LanguageType>): CustomKindOptions<Properties, LanguageType> {
        return {
            // no default options required here
            ...options,
        };
    }

    get(properties: CustomTypeInitialization<Properties, LanguageType>): TypeReference<CustomType<Properties, LanguageType>, LanguageType> {
        return new TypeReference<CustomType<Properties, LanguageType>, LanguageType>(() => this.calculateIdentifier(properties), this.services);
    }

    create(typeDetails: CustomTypeDetails<Properties, LanguageType>): CustomTypeConfigurationChain<Properties, LanguageType> {
        return new CustomConfigurationChainImpl(this.services, this, typeDetails);
    }

    calculateIdentifier(properties: CustomTypeInitialization<Properties, LanguageType>): string {
        if (this.options.calculateTypeIdentifier) {
            return this.options.calculateTypeIdentifier(properties);
        } else {
            return `custom-${this.options.name/*is unique for all custom kinds*/}-${this.calculateIdentifierAll(properties)}`;
        }
    }

    protected calculateIdentifierAll(properties: CustomTypeInitialization<Properties, LanguageType>): string {
        return Object.entries(properties)
            .map(entry => `${entry[0]}:${this.calculateIdentifierSingle(entry[1])}`)
            .join(',');
    }
    protected calculateIdentifierSingle<T extends CustomTypePropertyTypes>(value: CustomTypePropertyInitialization<T, LanguageType>): string {
        // all possible TypeSelectors
        if (typeof value === 'function') {
            return this.services.infrastructure.TypeResolver.resolve(value as TypeSelectorForCustomTypes<Type, LanguageType>).getIdentifier();
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
        }
        // composite with recursive object / index signature
        else if (typeof value === 'object' && value !== null) {
            return this.calculateIdentifierAll(value as CustomTypeInitialization<Properties, LanguageType>);
        } else {
            throw new Error(`missing implementation for ${value}`);
        }
    }
}

export function isCustomKind<Properties extends CustomTypeProperties, LanguageType>(kind: unknown): kind is CustomKind<Properties, LanguageType> {
    return kind instanceof CustomKind;
}


class CustomConfigurationChainImpl<Properties extends CustomTypeProperties, LanguageType> implements CustomConfigurationChainImpl<Properties, LanguageType> {
    protected readonly services: TypirServices<LanguageType>;
    protected readonly kind: CustomKind<Properties, LanguageType>;
    protected readonly typeDetails: CreateCustomTypeDetails<Properties, LanguageType>;

    constructor(services: TypirServices<LanguageType>, kind: CustomKind<Properties, LanguageType>, typeDetails: CustomTypeDetails<Properties, LanguageType>) {
        this.services = services;
        this.kind = kind;
        this.typeDetails = {
            ...typeDetails,
            inferenceRules: [],
        };
    }

    inferenceRule<T extends LanguageType>(rule: InferCurrentTypeRule<CustomType<Properties, LanguageType>, LanguageType, T>): CustomConfigurationChainImpl<Properties, LanguageType> {
        this.typeDetails.inferenceRules.push(rule as unknown as InferCurrentTypeRule<CustomType<Properties, LanguageType>, LanguageType>);
        return this;
    }

    finish(): TypeInitializer<CustomType<Properties, LanguageType>, LanguageType> {
        return new CustomTypeInitializer(this.kind, this.typeDetails);
    }
}
