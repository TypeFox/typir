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
import { TopClassType } from './top-class-type.js';

export interface TopClassTypeDetails<Specifics extends TypirSpecifics> extends TypeDetails<Specifics> {
    inferenceRules?: InferCurrentTypeRule<TopClassType, Specifics> | Array<InferCurrentTypeRule<TopClassType, Specifics>>
}

export interface TopClassKindOptions extends KindOptions {
    name: string;
}

export const TopClassKindName = 'TopClassKind';

export class TopClassKind<Specifics extends TypirSpecifics> implements Kind {
    readonly $name: string;
    readonly services: TypirServices<Specifics>;
    readonly options: TopClassKindOptions;
    protected instance: TopClassType | undefined;

    constructor(services: TypirServices<Specifics>, options?: Partial<TopClassKindOptions>) {
        this.options = this.collectOptions(options);
        this.$name = this.options.$name;
        this.services = services;
        this.services.infrastructure.Kinds.register(this);
    }

    protected collectOptions(options?: Partial<TopClassKindOptions>): TopClassKindOptions {
        return {
            // the default values:
            $name: TopClassKindName,
            name: 'TopClass',
            // the actually overriden values:
            ...options
        };
    }

    getTopClassType(typeDetails: TopClassTypeDetails<Specifics>): TopClassType | undefined {
        const key = this.calculateIdentifier(typeDetails);
        return this.services.infrastructure.Graph.getType(key) as TopClassType;
    }

    createTopClassType(typeDetails: TopClassTypeDetails<Specifics>): TopClassType {
        assertTrue(this.getTopClassType(typeDetails) === undefined);

        // create the top type (singleton)
        if (this.instance) {
            // note, that the given inference rules are ignored in this case!
            return this.instance;
        }
        const topType = new TopClassType(this as unknown as TopClassKind<TypirSpecifics>, this.calculateIdentifier(typeDetails), typeDetails as unknown as TopClassTypeDetails<TypirSpecifics>);
        this.instance = topType;
        this.services.infrastructure.Graph.addNode(topType);

        registerInferCurrentTypeRules(typeDetails.inferenceRules, topType, this.services);

        return topType;
    }

    calculateIdentifier(_typeDetails: TopClassTypeDetails<Specifics>): string {
        return this.options.name;
    }

}

export function isTopClassKind<Specifics extends TypirSpecifics>(kind: unknown): kind is TopClassKind<Specifics> {
    return kind instanceof TopClassKind;
}
