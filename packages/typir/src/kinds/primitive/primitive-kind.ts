/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeDetails } from '../../graph/type-node.js';
import { TypirServices } from '../../typir.js';
import { InferCurrentTypeRule, registerInferCurrentTypeRules } from '../../utils/utils-definitions.js';
import { assertTrue } from '../../utils/utils.js';
import { Kind, KindOptions } from '../kind.js';
import { PrimitiveType } from './primitive-type.js';

export interface PrimitiveKindOptions extends KindOptions {
    // empty for now
}

export interface PrimitiveTypeDetails<LanguageType> extends TypeDetails<LanguageType> {
    primitiveName: string;
}

interface CreatePrimitiveTypeDetails<LanguageType> extends PrimitiveTypeDetails<LanguageType> {
    inferenceRules: Array<InferCurrentTypeRule<PrimitiveType, LanguageType>>;
}

export const PrimitiveKindName = 'PrimitiveKind';

export interface PrimitiveFactoryService<LanguageType> {
    create(typeDetails: PrimitiveTypeDetails<LanguageType>): PrimitiveConfigurationChain<LanguageType>;
    get(typeDetails: PrimitiveTypeDetails<LanguageType>): PrimitiveType | undefined;
}

export interface PrimitiveConfigurationChain<LanguageType> {
    inferenceRule<T extends LanguageType>(rule: InferCurrentTypeRule<PrimitiveType, LanguageType, T>): PrimitiveConfigurationChain<LanguageType>;
    finish(): PrimitiveType;
}

export class PrimitiveKind<LanguageType> implements Kind, PrimitiveFactoryService<LanguageType> {
    readonly $name: string;
    readonly services: TypirServices<LanguageType>;
    readonly options: PrimitiveKindOptions;

    constructor(services: TypirServices<LanguageType>, options?: Partial<PrimitiveKindOptions>) {
        this.options = this.collectOptions(options);
        this.$name = this.options.$name;
        this.services = services;
        this.services.infrastructure.Kinds.register(this);
    }

    protected collectOptions(options?: Partial<PrimitiveKindOptions>): PrimitiveKindOptions {
        return {
            // the default values:
            $name: PrimitiveKindName,
            // the actually overriden values:
            ...options,
        };
    }

    get(typeDetails: PrimitiveTypeDetails<LanguageType>): PrimitiveType | undefined {
        const key = this.calculateIdentifier(typeDetails);
        return this.services.infrastructure.Graph.getType(key) as PrimitiveType;
    }

    create(typeDetails: PrimitiveTypeDetails<LanguageType>): PrimitiveConfigurationChain<LanguageType> {
        assertTrue(this.get(typeDetails) === undefined, `There is already a primitive type with name '${typeDetails.primitiveName}'.`); // ensure that the type is not created twice
        return new PrimitiveConfigurationChainImpl(this.services, this, typeDetails);
    }

    calculateIdentifier(typeDetails: PrimitiveTypeDetails<LanguageType>): string {
        return typeDetails.primitiveName;
    }
}

export function isPrimitiveKind<LanguageType>(kind: unknown): kind is PrimitiveKind<LanguageType> {
    return kind instanceof PrimitiveKind;
}


class PrimitiveConfigurationChainImpl<LanguageType> implements PrimitiveConfigurationChain<LanguageType> {
    protected readonly services: TypirServices<LanguageType>;
    protected readonly kind: PrimitiveKind<LanguageType>;
    protected readonly typeDetails: CreatePrimitiveTypeDetails<LanguageType>;

    constructor(services: TypirServices<LanguageType>, kind: PrimitiveKind<LanguageType>, typeDetails: PrimitiveTypeDetails<LanguageType>) {
        this.services = services;
        this.kind = kind;
        this.typeDetails = {
            ...typeDetails,
            inferenceRules: [],
        };
    }

    inferenceRule<T extends LanguageType>(rule: InferCurrentTypeRule<PrimitiveType, LanguageType, T>): PrimitiveConfigurationChain<LanguageType> {
        this.typeDetails.inferenceRules.push(rule as unknown as InferCurrentTypeRule<PrimitiveType, LanguageType>);
        return this;
    }

    finish(): PrimitiveType {
        // create the primitive type
        const currentPrimitiveType = new PrimitiveType(this.kind as PrimitiveKind<unknown>, this.kind.calculateIdentifier(this.typeDetails), this.typeDetails);
        this.services.infrastructure.Graph.addNode(currentPrimitiveType);

        // register the inference rules
        registerInferCurrentTypeRules(this.typeDetails.inferenceRules, currentPrimitiveType, this.services);

        return currentPrimitiveType;
    }
}
