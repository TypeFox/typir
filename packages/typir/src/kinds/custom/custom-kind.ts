/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeDetails } from '../../graph/type-node.js';
import { TypeInitializer } from '../../initialization/type-initializer.js';
import { TypeReference } from '../../initialization/type-reference.js';
import { TypirServices } from '../../typir.js';
import { InferCurrentTypeRule } from '../../utils/utils-definitions.js';
import { Kind } from '../kind.js';
import { CustomTypeInitialization, CustomTypeProperties } from './custom-definitions.js';
import { CustomTypeInitializer } from './custom-initializer.js';
import { CustomType } from './custom-type.js';

export interface CustomKindOptions<Properties extends CustomTypeProperties, LanguageType = unknown> {
    name: string;
    calculateIdentifier: (typeDetails: CustomTypeDetails<Properties, LanguageType>) => string;
}

export interface CustomTypeDetails<Properties extends CustomTypeProperties, LanguageType = unknown> extends TypeDetails<LanguageType> {
    properties: CustomTypeInitialization<Properties, LanguageType>;
    typeName?: string;
    typeUserRepresentation?: string;
}

export interface CreateCustomTypeDetails<Properties extends CustomTypeProperties, LanguageType = unknown> extends CustomTypeDetails<Properties, LanguageType> {
    inferenceRules: Array<InferCurrentTypeRule<CustomType<Properties, LanguageType>, LanguageType>>;
}

export interface CustomFactoryService<Properties extends CustomTypeProperties, LanguageType = unknown> {
    create(typeDetails: CustomTypeDetails<Properties, LanguageType>): CustomTypeConfigurationChain<Properties, LanguageType>;
    get(typeDetails: CustomTypeDetails<Properties, LanguageType>): TypeReference<CustomType<Properties, LanguageType>, LanguageType>;
    // TODO getOrCreateTopCustomType ??
}

export interface CustomTypeConfigurationChain<Properties extends CustomTypeProperties, LanguageType = unknown> {
    inferenceRule<T extends LanguageType>(rule: InferCurrentTypeRule<CustomType<Properties>, LanguageType, T>): CustomTypeConfigurationChain<Properties, LanguageType>;
    finish(): TypeInitializer<CustomType<Properties, LanguageType>, LanguageType>;
}


export class CustomKind<Properties extends CustomTypeProperties, LanguageType = unknown> implements Kind, CustomFactoryService<Properties, LanguageType> {
    readonly $name: 'CustomKind';
    readonly services: TypirServices<LanguageType>;
    readonly options: CustomKindOptions<Properties, LanguageType>;

    constructor(services: TypirServices<LanguageType>, options: CustomKindOptions<Properties, LanguageType>) {
        this.$name = 'CustomKind';
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

    get(typeDetails: CustomTypeDetails<Properties, LanguageType>): TypeReference<CustomType<Properties, LanguageType>, LanguageType> {
        return new TypeReference<CustomType<Properties, LanguageType>, LanguageType>(() => this.calculateIdentifier(typeDetails), this.services);
    }

    create(typeDetails: CustomTypeDetails<Properties, LanguageType>): CustomTypeConfigurationChain<Properties, LanguageType> {
        return new CustomConfigurationChainImpl(this.services, this, typeDetails);
    }

    calculateIdentifier(typeDetails: CustomTypeDetails<Properties, LanguageType>): string {
        return this.options.calculateIdentifier(typeDetails);
    }
}

export function isCustomKind<Properties extends CustomTypeProperties, LanguageType = unknown>(kind: unknown): kind is CustomKind<Properties, LanguageType> {
    return kind instanceof CustomKind;
}


class CustomConfigurationChainImpl<Properties extends CustomTypeProperties, LanguageType = unknown> implements CustomConfigurationChainImpl<Properties, LanguageType> {
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

    inferenceRule<T extends LanguageType>(rule: InferCurrentTypeRule<CustomType<Properties>, LanguageType, T>): CustomConfigurationChainImpl<Properties, LanguageType> {
        this.typeDetails.inferenceRules.push(rule as unknown as InferCurrentTypeRule<CustomType<Properties, LanguageType>, LanguageType>);
        return this;
    }

    finish(): TypeInitializer<CustomType<Properties, LanguageType>, LanguageType> {
        return new CustomTypeInitializer(this.kind, this.typeDetails);
    }
}
