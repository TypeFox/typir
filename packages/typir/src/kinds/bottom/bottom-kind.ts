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
import { BottomType } from './bottom-type.js';

export interface BottomTypeDetails extends TypeDetails {
    // empty
}
export interface CreateBottomTypeDetails extends BottomTypeDetails {
    inferenceRules: Array<InferCurrentTypeRule<unknown>>;
}

export interface BottomKindOptions {
    name: string;
}

export const BottomKindName = 'BottomKind';

export interface BottomFactoryService {
    create(typeDetails: BottomTypeDetails): BottomConfigurationChain;
    get(typeDetails: BottomTypeDetails): BottomType | undefined;
}

interface BottomConfigurationChain {
    inferenceRule<T>(rule: InferCurrentTypeRule<T>): BottomConfigurationChain;
    finish(): BottomType;
}

export class BottomKind implements Kind, BottomFactoryService {
    readonly $name: 'BottomKind';
    readonly services: TypirServices;
    readonly options: Readonly<BottomKindOptions>;

    constructor(services: TypirServices, options?: Partial<BottomKindOptions>) {
        this.$name = BottomKindName;
        this.services = services;
        this.services.infrastructure.Kinds.register(this);
        this.options = this.collectOptions(options);
    }

    protected collectOptions(options?: Partial<BottomKindOptions>): BottomKindOptions {
        return {
            // the default values:
            name: 'never',
            // the actually overriden values:
            ...options
        };
    }

    get(typeDetails: BottomTypeDetails): BottomType | undefined {
        const key = this.calculateIdentifier(typeDetails);
        return this.services.infrastructure.Graph.getType(key) as BottomType;
    }

    create(typeDetails: BottomTypeDetails): BottomConfigurationChain {
        assertTrue(this.get(typeDetails) === undefined);
        return new BottomConfigurationChainImpl(this.services, this, typeDetails);
    }

    calculateIdentifier(_typeDetails: BottomTypeDetails): string {
        return this.options.name;
    }

}

export function isBottomKind(kind: unknown): kind is BottomKind {
    return isKind(kind) && kind.$name === BottomKindName;
}


class BottomConfigurationChainImpl implements BottomConfigurationChain {
    protected readonly services: TypirServices;
    protected readonly kind: BottomKind;
    protected readonly typeDetails: CreateBottomTypeDetails;

    constructor(services: TypirServices, kind: BottomKind, typeDetails: BottomTypeDetails) {
        this.services = services;
        this.kind = kind;
        this.typeDetails = {
            ...typeDetails,
            inferenceRules: [],
        };
    }

    inferenceRule<T>(rule: InferCurrentTypeRule<T>): BottomConfigurationChain {
        this.typeDetails.inferenceRules.push(rule as InferCurrentTypeRule<unknown>);
        return this;
    }

    finish(): BottomType {
        const bottomType = new BottomType(this.kind, this.kind.calculateIdentifier(this.typeDetails), this.typeDetails);
        this.services.infrastructure.Graph.addNode(bottomType);

        registerInferCurrentTypeRules(this.typeDetails.inferenceRules, bottomType, this.services);

        return bottomType;
    }
}
