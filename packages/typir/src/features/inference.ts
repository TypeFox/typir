/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type } from '../graph/type-node.js';
import { Typir } from '../typir.js';

export interface TypeInference {
    inferType(domainElement: unknown): Type | undefined
}

/** Represents the signature to determine whether a domain element has a particular type.
 * This type/signature is a utility to formulate inference rules for dedicated semantic types.
 */
export type InferConcreteType = (domainElement: unknown) => boolean;
export function createInferenceRule(rule: InferConcreteType, concreteType: Type): TypeInference {
    return {
        inferType: (domainElement: unknown) => {
            return rule(domainElement) ? concreteType : undefined;
        }
    };
}

export interface TypeInferenceCollector extends TypeInference {
    addInferenceRule(rule: TypeInference): void;
}

export class DefaultTypeInferenceCollector implements TypeInferenceCollector {
    readonly inferenceRules: TypeInference[] = [];
    protected readonly typir: Typir;

    constructor(typir: Typir) {
        this.typir = typir;
    }

    inferType(domainElement: unknown): Type | undefined {
        for (const rule of this.inferenceRules) {
            const result = rule.inferType(domainElement);
            if (result) {
                return result;
            }
        }
        return undefined;
    }

    addInferenceRule(rule: TypeInference): void {
        this.inferenceRules.push(rule);
    }
}
