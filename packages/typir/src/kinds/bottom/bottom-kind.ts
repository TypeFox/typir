/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { InferenceRuleNotApplicable } from '../../services/inference.js';
import { TypirServices } from '../../typir.js';
import { assertTrue, toArray } from '../../utils/utils.js';
import { BottomType } from './bottom-type.js';
import { isKind, Kind } from '../kind.js';
import { TypeDetails } from '../../graph/type-node.js';

export interface BottomTypeDetails extends TypeDetails {
    /** In case of multiple inference rules, later rules are not evaluated anymore, if an earlier rule already matched. */
    inferenceRules?: InferBottomType | InferBottomType[]
}

export interface BottomKindOptions {
    name: string;
}

export type InferBottomType = (languageNode: unknown) => boolean;

export const BottomKindName = 'BottomKind';

export interface BottomFactoryService {
    create(typeDetails: BottomTypeDetails): BottomType;
    get(typeDetails: BottomTypeDetails): BottomType | undefined;
}

export class BottomKind implements Kind, BottomFactoryService {
    readonly $name: 'BottomKind';
    readonly services: TypirServices;
    readonly options: Readonly<BottomKindOptions>;
    protected instance: BottomType | undefined;

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

    create(typeDetails: BottomTypeDetails): BottomType {
        assertTrue(this.get(typeDetails) === undefined);
        // create the bottom type (singleton)
        if (this.instance) {
            // note, that the given inference rules are ignored in this case!
            return this.instance;
        }
        const bottomType = new BottomType(this, this.calculateIdentifier(typeDetails), typeDetails);
        this.instance = bottomType;
        this.services.infrastructure.Graph.addNode(bottomType);

        // register all inference rules for primitives within a single generic inference rule (in order to keep the number of "global" inference rules small)
        this.registerInferenceRules(typeDetails, bottomType);

        return bottomType;
    }

    protected registerInferenceRules(typeDetails: BottomTypeDetails, bottomType: BottomType) {
        const rules = toArray(typeDetails.inferenceRules);
        if (rules.length >= 1) {
            this.services.Inference.addInferenceRule((languageNode, _typir) => {
                for (const inferenceRule of rules) {
                    if (inferenceRule(languageNode)) {
                        return bottomType;
                    }
                }
                return InferenceRuleNotApplicable;
            }, bottomType);
        }
    }

    calculateIdentifier(_typeDetails: BottomTypeDetails): string {
        return this.options.name;
    }

}

export function isBottomKind(kind: unknown): kind is BottomKind {
    return isKind(kind) && kind.$name === BottomKindName;
}
