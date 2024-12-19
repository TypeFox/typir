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
import { TopType } from './top-type.js';

export interface TopTypeDetails extends TypeDetails {
    /** In case of multiple inference rules, later rules are not evaluated anymore, if an earlier rule already matched. */
    inferenceRules?: InferTopType | InferTopType[]
}

export interface TopKindOptions {
    name: string;
}

export type InferTopType = (domainElement: unknown) => boolean;

export const TopKindName = 'TopKind';

export interface TopFactoryService {
    create(typeDetails: TopTypeDetails): TopType;
    get(typeDetails: TopTypeDetails): TopType | undefined;
}

export class TopKind implements Kind, TopFactoryService {
    readonly $name: 'TopKind';
    readonly services: TypirServices;
    readonly options: Readonly<TopKindOptions>;
    protected instance: TopType | undefined;

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

    create(typeDetails: TopTypeDetails): TopType {
        assertTrue(this.get(typeDetails) === undefined);

        // create the top type (singleton)
        if (this.instance) {
            // note, that the given inference rules are ignored in this case!
            return this.instance;
        }
        const topType = new TopType(this, this.calculateIdentifier(typeDetails), typeDetails);
        this.instance = topType;
        this.services.infrastructure.Graph.addNode(topType);

        this.registerInferenceRules(typeDetails, topType);

        return topType;
    }

    /** Register all inference rules for primitives within a single generic inference rule (in order to keep the number of "global" inference rules small). */
    protected registerInferenceRules(typeDetails: TopTypeDetails, topType: TopType) {
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

    calculateIdentifier(_typeDetails: TopTypeDetails): string {
        return this.options.name;
    }

}

export function isTopKind(kind: unknown): kind is TopKind {
    return isKind(kind) && kind.$name === TopKindName;
}
