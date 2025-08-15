/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeDetails } from '../../graph/type-node.js';
import { TypirServices, TypirSpecifics } from '../../typir.js';
import { InferCurrentTypeRule, LanguageKeys, LanguageTypeOfLanguageKey, registerInferCurrentTypeRules } from '../../utils/utils-definitions.js';
import { assertTrue } from '../../utils/utils.js';
import { Kind, KindOptions } from '../kind.js';
import { BottomType } from './bottom-type.js';

export interface BottomTypeDetails<Specifics extends TypirSpecifics> extends TypeDetails<Specifics> {
    // empty
}
export interface CreateBottomTypeDetails<Specifics extends TypirSpecifics> extends BottomTypeDetails<Specifics> {
    inferenceRules: Array<InferCurrentTypeRule<BottomType, Specifics>>;
}

export interface BottomKindOptions extends KindOptions {
    name: string;
}

export const BottomKindName = 'BottomKind';

export interface BottomFactoryService<Specifics extends TypirSpecifics> {
    create(typeDetails: BottomTypeDetails<Specifics>): BottomConfigurationChain<Specifics>;
    get(typeDetails: BottomTypeDetails<Specifics>): BottomType | undefined;
}

export interface BottomConfigurationChain<Specifics extends TypirSpecifics> {
    inferenceRule<
        LanguageKey extends LanguageKeys<Specifics> = undefined,
        LanguageType extends LanguageTypeOfLanguageKey<Specifics, LanguageKey> = LanguageTypeOfLanguageKey<Specifics, LanguageKey>,
    >(rule: InferCurrentTypeRule<BottomType, Specifics, LanguageKey, LanguageType>): BottomConfigurationChain<Specifics>;
    finish(): BottomType;
}

export class BottomKind<Specifics extends TypirSpecifics> implements Kind, BottomFactoryService<Specifics> {
    readonly $name: string;
    readonly services: TypirServices<Specifics>;
    readonly options: Readonly<BottomKindOptions>;

    constructor(services: TypirServices<Specifics>, options?: Partial<BottomKindOptions>) {
        this.options = this.collectOptions(options);
        this.$name = this.options.$name;
        this.services = services;
        this.services.infrastructure.Kinds.register(this);
    }

    protected collectOptions(options?: Partial<BottomKindOptions>): BottomKindOptions {
        return {
            // the default values:
            $name: BottomKindName,
            name: 'never',
            // the actually overriden values:
            ...options
        };
    }

    get(typeDetails: BottomTypeDetails<Specifics>): BottomType | undefined {
        const key = this.calculateIdentifier(typeDetails);
        return this.services.infrastructure.Graph.getType(key) as BottomType;
    }

    create(typeDetails: BottomTypeDetails<Specifics>): BottomConfigurationChain<Specifics> {
        assertTrue(this.get(typeDetails) === undefined, 'The bottom type already exists.');
        return new BottomConfigurationChainImpl(this.services, this, typeDetails);
    }

    calculateIdentifier(_typeDetails: BottomTypeDetails<Specifics>): string {
        return this.options.name;
    }

}

export function isBottomKind<Specifics extends TypirSpecifics>(kind: unknown): kind is BottomKind<Specifics> {
    return kind instanceof BottomKind;
}


class BottomConfigurationChainImpl<Specifics extends TypirSpecifics> implements BottomConfigurationChain<Specifics> {
    protected readonly services: TypirServices<Specifics>;
    protected readonly kind: BottomKind<Specifics>;
    protected readonly typeDetails: CreateBottomTypeDetails<Specifics>;

    constructor(services: TypirServices<Specifics>, kind: BottomKind<Specifics>, typeDetails: BottomTypeDetails<Specifics>) {
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
    >(rule: InferCurrentTypeRule<BottomType, Specifics, LanguageKey, LanguageType>): BottomConfigurationChain<Specifics> {
        this.typeDetails.inferenceRules.push(rule as unknown as InferCurrentTypeRule<BottomType, Specifics>);
        return this;
    }

    finish(): BottomType {
        const bottomType = new BottomType(this.kind as unknown as BottomKind<TypirSpecifics>, this.kind.calculateIdentifier(this.typeDetails), this.typeDetails);
        this.services.infrastructure.Graph.addNode(bottomType);

        registerInferCurrentTypeRules(this.typeDetails.inferenceRules, bottomType, this.services);

        return bottomType;
    }
}
