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
import { TopClassType } from './top-class-type.js';

export interface TopClassTypeDetails extends TypeDetails {
    inferenceRules?: InferCurrentTypeRule | InferCurrentTypeRule[]
}

export interface TopClassKindOptions {
    name: string;
}

export const TopClassKindName = 'TopClassKind';

export class TopClassKind implements Kind {
    readonly $name: 'TopClassKind';
    readonly services: TypirServices;
    readonly options: TopClassKindOptions;
    protected instance: TopClassType | undefined;

    constructor(services: TypirServices, options?: Partial<TopClassKindOptions>) {
        this.$name = TopClassKindName;
        this.services = services;
        this.services.infrastructure.Kinds.register(this);
        this.options = this.collectOptions(options);
    }

    protected collectOptions(options?: Partial<TopClassKindOptions>): TopClassKindOptions {
        return {
            // the default values:
            name: 'TopClass',
            // the actually overriden values:
            ...options
        };
    }

    getTopClassType(typeDetails: TopClassTypeDetails): TopClassType | undefined {
        const key = this.calculateIdentifier(typeDetails);
        return this.services.infrastructure.Graph.getType(key) as TopClassType;
    }

    createTopClassType(typeDetails: TopClassTypeDetails): TopClassType {
        assertTrue(this.getTopClassType(typeDetails) === undefined);

        // create the top type (singleton)
        if (this.instance) {
            // note, that the given inference rules are ignored in this case!
            return this.instance;
        }
        const topType = new TopClassType(this, this.calculateIdentifier(typeDetails), typeDetails);
        this.instance = topType;
        this.services.infrastructure.Graph.addNode(topType);

        registerInferCurrentTypeRules(typeDetails.inferenceRules, topType, this.services);

        return topType;
    }

    calculateIdentifier(_typeDetails: TopClassTypeDetails): string {
        return this.options.name;
    }

}

export function isTopClassKind(kind: unknown): kind is TopClassKind {
    return isKind(kind) && kind.$name === TopClassKindName;
}
