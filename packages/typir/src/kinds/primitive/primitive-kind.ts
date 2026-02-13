/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeDetails } from '../../graph/type-node.js';
import { LanguageKeys, LanguageTypeOfLanguageKey, TypirServices, TypirSpecifics } from '../../typir.js';
import { InferCurrentTypeRule, registerInferCurrentTypeRules } from '../../utils/utils-definitions.js';
import { assertTrue } from '../../utils/utils.js';
import { Kind, KindOptions } from '../kind.js';
import { PrimitiveType } from './primitive-type.js';

export interface PrimitiveKindOptions extends KindOptions {
    // empty for now
}

export interface PrimitiveTypeDetails<Specifics extends TypirSpecifics> extends TypeDetails<Specifics> {
    primitiveName: string;
}

interface CreatePrimitiveTypeDetails<Specifics extends TypirSpecifics> extends PrimitiveTypeDetails<Specifics> {
    inferenceRules: Array<InferCurrentTypeRule<PrimitiveType, Specifics>>;
}

export const PrimitiveKindName = 'PrimitiveKind';

export interface PrimitiveFactoryService<Specifics extends TypirSpecifics> {
    create(typeDetails: PrimitiveTypeDetails<Specifics>): PrimitiveConfigurationChain<Specifics>;
    get(typeDetails: PrimitiveTypeDetails<Specifics>): PrimitiveType | undefined;
}

export interface PrimitiveConfigurationChain<Specifics extends TypirSpecifics> {
    inferenceRule<
        LanguageKey extends LanguageKeys<Specifics> = undefined,
        LanguageType extends LanguageTypeOfLanguageKey<Specifics, LanguageKey> = LanguageTypeOfLanguageKey<Specifics, LanguageKey>,
    >(rule: InferCurrentTypeRule<PrimitiveType, Specifics, LanguageKey, LanguageType>): PrimitiveConfigurationChain<Specifics>;
    finish(): PrimitiveType;
}

export class PrimitiveKind<Specifics extends TypirSpecifics> implements Kind, PrimitiveFactoryService<Specifics> {
    readonly $name: string;
    readonly services: TypirServices<Specifics>;
    readonly options: PrimitiveKindOptions;

    constructor(services: TypirServices<Specifics>, options?: Partial<PrimitiveKindOptions>) {
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

    get(typeDetails: PrimitiveTypeDetails<Specifics>): PrimitiveType | undefined {
        const key = this.calculateIdentifier(typeDetails);
        return this.services.infrastructure.Graph.getType(key) as PrimitiveType;
    }

    create(typeDetails: PrimitiveTypeDetails<Specifics>): PrimitiveConfigurationChain<Specifics> {
        assertTrue(this.get(typeDetails) === undefined, `There is already a primitive type with name '${typeDetails.primitiveName}'.`); // ensure that the type is not created twice
        return new PrimitiveConfigurationChainImpl(this.services, this, typeDetails);
    }

    calculateIdentifier(typeDetails: PrimitiveTypeDetails<Specifics>): string {
        return typeDetails.primitiveName;
    }
}

export function isPrimitiveKind<Specifics extends TypirSpecifics>(kind: unknown): kind is PrimitiveKind<Specifics> {
    return kind instanceof PrimitiveKind;
}


class PrimitiveConfigurationChainImpl<Specifics extends TypirSpecifics> implements PrimitiveConfigurationChain<Specifics> {
    protected readonly services: TypirServices<Specifics>;
    protected readonly kind: PrimitiveKind<Specifics>;
    protected readonly typeDetails: CreatePrimitiveTypeDetails<Specifics>;

    constructor(services: TypirServices<Specifics>, kind: PrimitiveKind<Specifics>, typeDetails: PrimitiveTypeDetails<Specifics>) {
        this.services = services;
        this.kind = kind;
        this.typeDetails = {
            ...typeDetails,
            inferenceRules: [],
        };
    }

    inferenceRule<
        LanguageKey extends LanguageKeys<Specifics> = undefined,
        LanguageType extends LanguageTypeOfLanguageKey<Specifics, LanguageKey> = LanguageTypeOfLanguageKey<Specifics, LanguageKey>,
    >(rule: InferCurrentTypeRule<PrimitiveType, Specifics, LanguageKey, LanguageType>): PrimitiveConfigurationChain<Specifics> {
        this.typeDetails.inferenceRules.push(rule as unknown as InferCurrentTypeRule<PrimitiveType, Specifics>);
        return this;
    }

    finish(): PrimitiveType {
        // create the primitive type
        const currentPrimitiveType = new PrimitiveType(this.kind as unknown as PrimitiveKind<TypirSpecifics>, this.kind.calculateIdentifier(this.typeDetails), this.typeDetails);
        this.services.infrastructure.Graph.addNode(currentPrimitiveType);

        // register the inference rules
        registerInferCurrentTypeRules(this.typeDetails.inferenceRules, currentPrimitiveType, this.services);

        return currentPrimitiveType;
    }
}
