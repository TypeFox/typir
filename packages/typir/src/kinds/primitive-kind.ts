/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { TypirProblem, compareValueForConflict as compareValuesForConflict } from '../utils/utils-type-comparison.js';
import { toArray } from '../utils/utils.js';
import { Kind, isKind } from './kind.js';

export type InferPrimitiveType = (domainElement: unknown) => boolean;

export const PrimitiveKindName = 'PrimitiveKind';

export class PrimitiveKind implements Kind {
    readonly $name: 'PrimitiveKind';
    readonly typir: Typir;

    constructor(typir: Typir) {
        this.$name = 'PrimitiveKind';
        this.typir = typir;
        this.typir.registerKind(this);
    }

    createPrimitiveType(typeDetails: {
        primitiveName: string,
        /** In case of multiple inference rules, later rules are not evaluated anymore, if an earler rule already matched. */
        inferenceRules?: InferPrimitiveType | InferPrimitiveType[]
    }): Type {
        // create the primitive type
        const primitiveType = new Type(this, typeDetails.primitiveName);
        this.typir.graph.addNode(primitiveType);
        // register all inference rules for primitives within a single generic inference rule (in order to keep the number of "global" inference rules small)
        const rules = toArray(typeDetails.inferenceRules);
        if (rules.length >= 1) {
            this.typir.inference.addInferenceRule({
                isRuleApplicable(domainElement, _typir) {
                    for (const inferenceRule of rules) {
                        if (inferenceRule(domainElement)) {
                            return primitiveType;
                        }
                    }
                    return 'RULE_NOT_APPLICABLE';
                },
            });
        }
        return primitiveType;
    }

    getUserRepresentation(type: Type): string {
        return type.name;
    }

    isSubType(superType: Type, subType: Type): TypirProblem[] {
        return this.areTypesEqual(superType, subType);
    }

    areTypesEqual(type1: Type, type2: Type): TypirProblem[] {
        if (isPrimitiveKind(type1.kind) && isPrimitiveKind(type2.kind)) {
            return compareValuesForConflict(type1.name, type2.name, 'name');
        }
        throw new Error();
    }
}

export function isPrimitiveKind(kind: unknown): kind is PrimitiveKind {
    return isKind(kind) && kind.$name === PrimitiveKindName;
}
