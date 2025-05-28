/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeDetails } from "../../graph/type-node.js";
import { TypirServices } from "../../typir.js";
import {
    InferCurrentTypeRule,
    registerInferCurrentTypeRules,
} from "../../utils/utils-definitions.js";
import { assertTrue } from "../../utils/utils.js";
import { isKind, Kind } from "../kind.js";
import { TopType } from "./top-type.js";

export interface TopTypeDetails<LanguageType>
    extends TypeDetails<LanguageType> {
    // empty
}
interface CreateTopTypeDetails<LanguageType>
    extends TopTypeDetails<LanguageType> {
    inferenceRules: Array<InferCurrentTypeRule<TopType, LanguageType>>;
}

export interface TopKindOptions {
    name: string;
}

export const TopKindName = "TopKind";

export interface TopFactoryService<LanguageType> {
    create(
        typeDetails: TopTypeDetails<LanguageType>,
    ): TopConfigurationChain<LanguageType>;
    get(typeDetails: TopTypeDetails<LanguageType>): TopType | undefined;
}

export interface TopConfigurationChain<LanguageType> {
    inferenceRule<T extends LanguageType>(
        rule: InferCurrentTypeRule<TopType, LanguageType, T>,
    ): TopConfigurationChain<LanguageType>;
    finish(): TopType;
}

export class TopKind<LanguageType>
    implements Kind, TopFactoryService<LanguageType>
{
    readonly $name: "TopKind";
    readonly services: TypirServices<LanguageType>;
    readonly options: Readonly<TopKindOptions>;

    constructor(
        services: TypirServices<LanguageType>,
        options?: Partial<TopKindOptions>,
    ) {
        this.$name = TopKindName;
        this.services = services;
        this.services.infrastructure.Kinds.register(this);
        this.options = this.collectOptions(options);
    }

    protected collectOptions(
        options?: Partial<TopKindOptions>,
    ): TopKindOptions {
        return {
            // the default values:
            name: "any",
            // the actually overriden values:
            ...options,
        };
    }

    get(typeDetails: TopTypeDetails<LanguageType>): TopType | undefined {
        const key = this.calculateIdentifier(typeDetails);
        return this.services.infrastructure.Graph.getType(key) as TopType;
    }

    create(
        typeDetails: TopTypeDetails<LanguageType>,
    ): TopConfigurationChain<LanguageType> {
        assertTrue(this.get(typeDetails) === undefined); // ensure that the type is not created twice
        return new TopConfigurationChainImpl(this.services, this, typeDetails);
    }

    calculateIdentifier(_typeDetails: TopTypeDetails<LanguageType>): string {
        return this.options.name;
    }
}

export function isTopKind<LanguageType>(
    kind: unknown,
): kind is TopKind<LanguageType> {
    return isKind(kind) && kind.$name === TopKindName;
}

class TopConfigurationChainImpl<LanguageType>
    implements TopConfigurationChain<LanguageType>
{
    protected readonly services: TypirServices<LanguageType>;
    protected readonly kind: TopKind<LanguageType>;
    protected readonly typeDetails: CreateTopTypeDetails<LanguageType>;

    constructor(
        services: TypirServices<LanguageType>,
        kind: TopKind<LanguageType>,
        typeDetails: TopTypeDetails<LanguageType>,
    ) {
        this.services = services;
        this.kind = kind;
        this.typeDetails = {
            ...typeDetails,
            inferenceRules: [],
        };
    }

    inferenceRule<T extends LanguageType>(
        rule: InferCurrentTypeRule<TopType, LanguageType, T>,
    ): TopConfigurationChain<LanguageType> {
        this.typeDetails.inferenceRules.push(
            rule as unknown as InferCurrentTypeRule<TopType, LanguageType>,
        );
        return this;
    }

    finish(): TopType {
        const topType = new TopType(
            this.kind as TopKind<unknown>,
            this.kind.calculateIdentifier(this.typeDetails),
            this.typeDetails,
        );
        this.services.infrastructure.Graph.addNode(topType);

        registerInferCurrentTypeRules(
            this.typeDetails.inferenceRules,
            topType,
            this.services,
        );

        return topType;
    }
}
