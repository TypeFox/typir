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
import { PrimitiveType } from './primitive-type.js';

export interface PrimitiveKindOptions {
    // empty for now
}

export interface PrimitiveTypeDetails extends TypeDetails {
    primitiveName: string;
    /** In case of multiple inference rules, later rules are not evaluated anymore, if an earler rule already matched. */
    inferenceRules?: InferPrimitiveType | InferPrimitiveType[];
}

export type InferPrimitiveType = (domainElement: unknown) => boolean;

export const PrimitiveKindName = 'PrimitiveKind';

export interface PrimitiveFactoryService {
    create(typeDetails: PrimitiveTypeDetails): PrimitiveType;
    get(typeDetails: PrimitiveTypeDetails): PrimitiveType | undefined;
}

export class PrimitiveKind implements Kind, PrimitiveFactoryService {
    readonly $name: 'PrimitiveKind';
    readonly services: TypirServices;
    readonly options: PrimitiveKindOptions;

    constructor(services: TypirServices, options?: Partial<PrimitiveKindOptions>) {
        this.$name = PrimitiveKindName;
        this.services = services;
        this.services.infrastructure.Kinds.register(this);
        this.options = this.collectOptions(options);
    }

    protected collectOptions(options?: Partial<PrimitiveKindOptions>): PrimitiveKindOptions {
        return {
            ...options,
        };
    }

    get(typeDetails: PrimitiveTypeDetails): PrimitiveType | undefined {
        const key = this.calculateIdentifier(typeDetails);
        return this.services.infrastructure.Graph.getType(key) as PrimitiveType;
    }

    create(typeDetails: PrimitiveTypeDetails): PrimitiveType {
        assertTrue(this.get(typeDetails) === undefined);

        // create the primitive type
        const primitiveType = new PrimitiveType(this, this.calculateIdentifier(typeDetails), typeDetails);
        this.services.infrastructure.Graph.addNode(primitiveType);

        this.registerInferenceRules(typeDetails, primitiveType);

        return primitiveType;
    }

    /** Register all inference rules for primitives within a single generic inference rule (in order to keep the number of "global" inference rules small). */
    protected registerInferenceRules(typeDetails: PrimitiveTypeDetails, primitiveType: PrimitiveType) {
        const rules = toArray(typeDetails.inferenceRules);
        if (rules.length >= 1) {
            this.services.Inference.addInferenceRule((domainElement, _typir) => {
                for (const inferenceRule of rules) {
                    if (inferenceRule(domainElement)) {
                        return primitiveType;
                    }
                }
                return InferenceRuleNotApplicable;
            }, primitiveType);
        }
    }

    calculateIdentifier(typeDetails: PrimitiveTypeDetails): string {
        return typeDetails.primitiveName;
    }
}

export function isPrimitiveKind(kind: unknown): kind is PrimitiveKind {
    return isKind(kind) && kind.$name === PrimitiveKindName;
}
