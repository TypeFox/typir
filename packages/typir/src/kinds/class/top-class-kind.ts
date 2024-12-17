/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeDetails } from '../../graph/type-node.js';
import { InferenceRuleNotApplicable } from '../../services/inference.js';
import { TypirServices } from '../../typir.js';
import { assertTrue, toArray } from '../../utils/utils.js';
import { isKind, Kind } from '../kind.js';
import { TopClassType } from './top-class-type.js';

export interface TopClassTypeDetails extends TypeDetails {
    inferenceRules?: InferTopClassType | InferTopClassType[]
}

export type InferTopClassType = (domainElement: unknown) => boolean;

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
        this.options = {
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

    getOrCreateTopClassType(typeDetails: TopClassTypeDetails): TopClassType {
        const topType = this.getTopClassType(typeDetails);
        if (topType) {
            this.registerInferenceRules(typeDetails, topType);
            return topType;
        }
        return this.createTopClassType(typeDetails);
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

        this.registerInferenceRules(typeDetails, topType);

        return topType;
    }

    /** Register all inference rules for primitives within a single generic inference rule (in order to keep the number of "global" inference rules small). */
    protected registerInferenceRules(typeDetails: TopClassTypeDetails, topType: TopClassType) {
        const rules = toArray(typeDetails.inferenceRules);
        if (rules.length >= 1) {
            this.services.Inference.addInferenceRule((domainElement, _typir) => {
                for (const inferenceRule of rules) {
                    if (inferenceRule(domainElement)) {
                        return topType;
                    }
                }
                return InferenceRuleNotApplicable;
            }, topType);
        }
    }

    calculateIdentifier(_typeDetails: TopClassTypeDetails): string {
        return this.options.name;
    }

}

export function isTopClassKind(kind: unknown): kind is TopClassKind {
    return isKind(kind) && kind.$name === TopClassKindName;
}
