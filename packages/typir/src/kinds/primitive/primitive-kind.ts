/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { InferenceRuleNotApplicable } from '../../services/inference.js';
import { TypirServices } from '../../typir.js';
import { assertTrue, toArray } from '../../utils/utils.js';
import { isKind, Kind } from '../kind.js';
import { PrimitiveType } from './primitive-type.js';

export interface PrimitiveTypeDetails {
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

    constructor(services: TypirServices) {
        this.$name = PrimitiveKindName;
        this.services = services;
        this.services.kinds.register(this);
    }

    get(typeDetails: PrimitiveTypeDetails): PrimitiveType | undefined {
        const key = this.calculateIdentifier(typeDetails);
        return this.services.graph.getType(key) as PrimitiveType;
    }

    create(typeDetails: PrimitiveTypeDetails): PrimitiveType {
        assertTrue(this.get(typeDetails) === undefined);

        // create the primitive type
        const primitiveType = new PrimitiveType(this, this.calculateIdentifier(typeDetails));
        this.services.graph.addNode(primitiveType);

        this.registerInferenceRules(typeDetails, primitiveType);

        return primitiveType;
    }

    /** Register all inference rules for primitives within a single generic inference rule (in order to keep the number of "global" inference rules small). */
    protected registerInferenceRules(typeDetails: PrimitiveTypeDetails, primitiveType: PrimitiveType) {
        const rules = toArray(typeDetails.inferenceRules);
        if (rules.length >= 1) {
            this.services.inference.addInferenceRule((domainElement, _typir) => {
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
