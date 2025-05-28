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

export interface BottomTypeDetails<LanguageType> extends TypeDetails<LanguageType> {
    // empty
}
export interface CreateBottomTypeDetails<LanguageType> extends BottomTypeDetails<LanguageType> {
    inferenceRules: Array<InferCurrentTypeRule<BottomType, LanguageType>>;
}

export interface BottomKindOptions {
    name: string;
}

export const BottomKindName = 'BottomKind';

export interface BottomFactoryService<LanguageType> {
    create(typeDetails: BottomTypeDetails<LanguageType>): BottomConfigurationChain<LanguageType>;
    get(typeDetails: BottomTypeDetails<LanguageType>): BottomType | undefined;
}

interface BottomConfigurationChain<LanguageType> {
    inferenceRule<T extends LanguageType>(rule: InferCurrentTypeRule<BottomType, LanguageType, T>): BottomConfigurationChain<LanguageType>;
    finish(): BottomType;
}

export class BottomKind<LanguageType> implements Kind, BottomFactoryService<LanguageType> {
    readonly $name: 'BottomKind';
    readonly services: TypirServices<LanguageType>;
    readonly options: Readonly<BottomKindOptions>;

    constructor(services: TypirServices<LanguageType>, options?: Partial<BottomKindOptions>) {
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

    get(typeDetails: BottomTypeDetails<LanguageType>): BottomType | undefined {
        const key = this.calculateIdentifier(typeDetails);
        return this.services.infrastructure.Graph.getType(key) as BottomType;
    }

    create(typeDetails: BottomTypeDetails<LanguageType>): BottomConfigurationChain<LanguageType> {
        assertTrue(this.get(typeDetails) === undefined, 'The bottom type already exists.');
        return new BottomConfigurationChainImpl(this.services, this, typeDetails);
    }

    calculateIdentifier(_typeDetails: BottomTypeDetails<LanguageType>): string {
        return this.options.name;
    }

}

export function isBottomKind<LanguageType>(kind: unknown): kind is BottomKind<LanguageType> {
    return isKind(kind) && kind.$name === BottomKindName;
}


class BottomConfigurationChainImpl<LanguageType> implements BottomConfigurationChain<LanguageType> {
    protected readonly services: TypirServices<LanguageType>;
    protected readonly kind: BottomKind<LanguageType>;
    protected readonly typeDetails: CreateBottomTypeDetails<LanguageType>;

    constructor(services: TypirServices<LanguageType>, kind: BottomKind<LanguageType>, typeDetails: BottomTypeDetails<LanguageType>) {
        this.services = services;
        this.kind = kind;
        this.typeDetails = {
            ...typeDetails,
            inferenceRules: [],
        };
    }

    inferenceRule<T extends LanguageType>(rule: InferCurrentTypeRule<BottomType, LanguageType, T>): BottomConfigurationChain<LanguageType> {
        this.typeDetails.inferenceRules.push(rule as unknown as InferCurrentTypeRule<BottomType, LanguageType>);
        return this;
    }

    finish(): BottomType {
        const bottomType = new BottomType(this.kind as BottomKind<unknown>, this.kind.calculateIdentifier(this.typeDetails), this.typeDetails);
        this.services.infrastructure.Graph.addNode(bottomType);

        registerInferCurrentTypeRules(this.typeDetails.inferenceRules, bottomType, this.services);

        return bottomType;
    }
}
