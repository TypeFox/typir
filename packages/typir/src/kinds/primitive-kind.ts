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
        inferenceRules?: InferPrimitiveType | InferPrimitiveType[]
    }): Type {
        // create the primitive type
        const primitiveType = new Type(this, typeDetails.primitiveName);
        this.typir.graph.addNode(primitiveType);
        // register all inference rules
        for (const inferenceRule of toArray(typeDetails.inferenceRules)) {
            this.typir.inference.addInferenceRule({
                isRuleApplicable(domainElement) {
                    return inferenceRule(domainElement) ? primitiveType : 'RULE_NOT_APPLICABLE';
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
