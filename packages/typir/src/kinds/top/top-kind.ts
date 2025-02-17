/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeDetails } from '../../graph/type-node.js';
import { TypirServices } from '../../typir.js';
import { InferCurrentTypeRule, registerInferCurrentTypeRules } from '../../utils/utils-definitions.js';
import { assertTrue } from '../../utils/utils.js';
import { isKind, Kind } from '../kind.js';
import { TopType } from './top-type.js';

export interface TopTypeDetails extends TypeDetails {
    // empty
}
interface CreateTopTypeDetails extends TypeDetails {
    inferenceRules: Array<InferCurrentTypeRule<unknown>>;
}

export interface TopKindOptions {
    name: string;
}

export const TopKindName = 'TopKind';

export interface TopFactoryService {
    create(typeDetails: TopTypeDetails): TopConfigurationChain;
    get(typeDetails: TopTypeDetails): TopType | undefined;
}

export interface TopConfigurationChain {
    inferenceRule<T>(rule: InferCurrentTypeRule<T>): TopConfigurationChain;
    finish(): TopType;
}

export class TopKind implements Kind, TopFactoryService {
    readonly $name: 'TopKind';
    readonly services: TypirServices;
    readonly options: Readonly<TopKindOptions>;

    constructor(services: TypirServices, options?: Partial<TopKindOptions>) {
        this.$name = TopKindName;
        this.services = services;
        this.services.infrastructure.Kinds.register(this);
        this.options = this.collectOptions(options);
    }

    protected collectOptions(options?: Partial<TopKindOptions>): TopKindOptions {
        return {
            // the default values:
            name: 'any',
            // the actually overriden values:
            ...options
        };
    }

    get(typeDetails: TopTypeDetails): TopType | undefined {
        const key = this.calculateIdentifier(typeDetails);
        return this.services.infrastructure.Graph.getType(key) as TopType;
    }

    create(typeDetails: TopTypeDetails): TopConfigurationChain {
        assertTrue(this.get(typeDetails) === undefined); // ensure that the type is not created twice
        return new TopConfigurationChainImpl(this.services, this, typeDetails);
    }

    calculateIdentifier(_typeDetails: TopTypeDetails): string {
        return this.options.name;
    }

}

export function isTopKind(kind: unknown): kind is TopKind {
    return isKind(kind) && kind.$name === TopKindName;
}


class TopConfigurationChainImpl implements TopConfigurationChain {
    protected readonly services: TypirServices;
    protected readonly kind: TopKind;
    protected readonly typeDetails: CreateTopTypeDetails;

    constructor(services: TypirServices, kind: TopKind, typeDetails: TopTypeDetails) {
        this.services = services;
        this.kind = kind;
        this.typeDetails = {
            ...typeDetails,
            inferenceRules: [],
        };
    }

    inferenceRule<T>(rule: InferCurrentTypeRule<T>): TopConfigurationChain {
        this.typeDetails.inferenceRules.push(rule as InferCurrentTypeRule<unknown>);
        return this;
    }

    finish(): TopType {
        const topType = new TopType(this.kind, this.kind.calculateIdentifier(this.typeDetails), this.typeDetails);
        this.services.infrastructure.Graph.addNode(topType);

        registerInferCurrentTypeRules(this.typeDetails.inferenceRules, topType, this.services);

        return topType;
    }
}
