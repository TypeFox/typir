/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeDetails } from '../../graph/type-node.js';
import { TypirServices, TypirSpecifics } from '../../typir.js';
import { InferCurrentTypeRule, registerInferCurrentTypeRules } from '../../utils/utils-definitions.js';
import { assertTrue } from '../../utils/utils.js';
import { Kind, KindOptions } from '../kind.js';
import { TopType } from './top-type.js';

export interface TopTypeDetails<Specifics extends TypirSpecifics> extends TypeDetails<Specifics> {
    // empty
}
interface CreateTopTypeDetails<Specifics extends TypirSpecifics> extends TopTypeDetails<Specifics> {
    inferenceRules: Array<InferCurrentTypeRule<TopType, Specifics>>;
}

export interface TopKindOptions extends KindOptions {
    name: string;
}

export const TopKindName = 'TopKind';

export interface TopFactoryService<Specifics extends TypirSpecifics> {
    create(typeDetails: TopTypeDetails<Specifics>): TopConfigurationChain<Specifics>;
    get(typeDetails: TopTypeDetails<Specifics>): TopType | undefined;
}

export interface TopConfigurationChain<Specifics extends TypirSpecifics> {
    inferenceRule<T extends Specifics['LanguageType']>(rule: InferCurrentTypeRule<TopType, Specifics, T>): TopConfigurationChain<Specifics>;
    finish(): TopType;
}

export class TopKind<Specifics extends TypirSpecifics> implements Kind, TopFactoryService<Specifics> {
    readonly $name: string;
    readonly services: TypirServices<Specifics>;
    readonly options: Readonly<TopKindOptions>;

    constructor(services: TypirServices<Specifics>, options?: Partial<TopKindOptions>) {
        this.options = this.collectOptions(options);
        this.$name = this.options.$name;
        this.services = services;
        this.services.infrastructure.Kinds.register(this);
    }

    protected collectOptions(options?: Partial<TopKindOptions>): TopKindOptions {
        return {
            // the default values:
            $name: TopKindName,
            name: 'any',
            // the actually overriden values:
            ...options
        };
    }

    get(typeDetails: TopTypeDetails<Specifics>): TopType | undefined {
        const key = this.calculateIdentifier(typeDetails);
        return this.services.infrastructure.Graph.getType(key) as TopType;
    }

    create(typeDetails: TopTypeDetails<Specifics>): TopConfigurationChain<Specifics> {
        assertTrue(this.get(typeDetails) === undefined, 'The top type already exists.'); // ensure that the type is not created twice
        return new TopConfigurationChainImpl(this.services, this, typeDetails);
    }

    calculateIdentifier(_typeDetails: TopTypeDetails<Specifics>): string {
        return this.options.name;
    }

}

export function isTopKind<Specifics extends TypirSpecifics>(kind: unknown): kind is TopKind<Specifics> {
    return kind instanceof TopKind;
}


class TopConfigurationChainImpl<Specifics extends TypirSpecifics> implements TopConfigurationChain<Specifics> {
    protected readonly services: TypirServices<Specifics>;
    protected readonly kind: TopKind<Specifics>;
    protected readonly typeDetails: CreateTopTypeDetails<Specifics>;

    constructor(services: TypirServices<Specifics>, kind: TopKind<Specifics>, typeDetails: TopTypeDetails<Specifics>) {
        this.services = services;
        this.kind = kind;
        this.typeDetails = {
            ...typeDetails,
            inferenceRules: [],
        };
    }

    inferenceRule<T extends Specifics['LanguageType']>(rule: InferCurrentTypeRule<TopType, Specifics, T>): TopConfigurationChain<Specifics> {
        this.typeDetails.inferenceRules.push(rule as unknown as InferCurrentTypeRule<TopType, Specifics>);
        return this;
    }

    finish(): TopType {
        const topType = new TopType(this.kind as unknown as TopKind<TypirSpecifics>, this.kind.calculateIdentifier(this.typeDetails), this.typeDetails);
        this.services.infrastructure.Graph.addNode(topType);

        registerInferCurrentTypeRules(this.typeDetails.inferenceRules, topType, this.services);

        return topType;
    }
}
