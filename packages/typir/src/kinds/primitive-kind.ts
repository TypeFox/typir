/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeEqualityProblem } from '../features/equality.js';
import { InferenceRuleNotApplicable } from '../features/inference.js';
import { SubTypeProblem } from '../features/subtype.js';
import { isType, Type } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { TypirProblem } from '../utils/utils-definitions.js';
import { checkValueForConflict, createKindConflict } from '../utils/utils-type-comparison.js';
import { toArray } from '../utils/utils.js';
import { isKind, Kind } from './kind.js';

export class PrimitiveType extends Type {
    override readonly kind: PrimitiveKind;

    constructor(kind: PrimitiveKind, identifier: string) {
        super(identifier);
        this.kind = kind;
    }

    override getName(): string {
        return this.identifier;
    }

    override getUserRepresentation(): string {
        return this.identifier;
    }

    override analyzeTypeEqualityProblems(otherType: Type): TypirProblem[] {
        if (isPrimitiveType(otherType)) {
            return checkValueForConflict(this.identifier, otherType.identifier, 'name');
        } else {
            return [<TypeEqualityProblem>{
                $problem: TypeEqualityProblem,
                type1: this,
                type2: otherType,
                subProblems: [createKindConflict(otherType, this)],
            }];
        }
    }

    override analyzeIsSubTypeOf(superType: Type): TypirProblem[] {
        if (isPrimitiveType(superType)) {
            return this.analyzeSubTypeProblems(this, superType);
        } else {
            return [<SubTypeProblem>{
                $problem: SubTypeProblem,
                superType,
                subType: this,
                subProblems: [createKindConflict(this, superType)],
            }];
        }
    }

    override analyzeIsSuperTypeOf(subType: Type): TypirProblem[] {
        if (isPrimitiveType(subType)) {
            return this.analyzeSubTypeProblems(subType, this);
        } else {
            return [<SubTypeProblem>{
                $problem: SubTypeProblem,
                superType: this,
                subType,
                subProblems: [createKindConflict(subType, this)],
            }];
        }
    }

    protected analyzeSubTypeProblems(subType: PrimitiveType, superType: PrimitiveType): TypirProblem[] {
        return subType.analyzeTypeEqualityProblems(superType);
    }

}

export function isPrimitiveType(type: unknown): type is PrimitiveType {
    return isType(type) && isPrimitiveKind(type.kind);
}



export interface PrimitiveTypeDetails {
    primitiveName: string;
    /** In case of multiple inference rules, later rules are not evaluated anymore, if an earler rule already matched. */
    inferenceRules?: InferPrimitiveType | InferPrimitiveType[];
}

export type InferPrimitiveType = (domainElement: unknown) => boolean;

export const PrimitiveKindName = 'PrimitiveKind';

export class PrimitiveKind implements Kind {
    readonly $name: 'PrimitiveKind';
    readonly typir: Typir;

    constructor(typir: Typir) {
        this.$name = PrimitiveKindName;
        this.typir = typir;
        this.typir.registerKind(this);
    }

    getPrimitiveType(typeDetails: PrimitiveTypeDetails): PrimitiveType | undefined {
        const key = this.calculateIdentifier(typeDetails);
        return this.typir.graph.getType(key) as PrimitiveType;
    }

    getOrCreatePrimitiveType(typeDetails: PrimitiveTypeDetails): PrimitiveType {
        const result = this.getPrimitiveType(typeDetails);
        if (result) {
            return result;
        }
        return this.createPrimitiveType(typeDetails);
    }

    createPrimitiveType(typeDetails: PrimitiveTypeDetails): PrimitiveType {
        // create the primitive type
        const primitiveType = new PrimitiveType(this, this.calculateIdentifier(typeDetails));
        this.typir.graph.addNode(primitiveType);

        // register all inference rules for primitives within a single generic inference rule (in order to keep the number of "global" inference rules small)
        const rules = toArray(typeDetails.inferenceRules);
        if (rules.length >= 1) {
            this.typir.inference.addInferenceRule((domainElement, _typir) => {
                for (const inferenceRule of rules) {
                    if (inferenceRule(domainElement)) {
                        return primitiveType;
                    }
                }
                return InferenceRuleNotApplicable;
            });
        }

        return primitiveType;
    }

    calculateIdentifier(typeDetails: PrimitiveTypeDetails): string {
        return typeDetails.primitiveName;
    }
}

export function isPrimitiveKind(kind: unknown): kind is PrimitiveKind {
    return isKind(kind) && kind.$name === PrimitiveKindName;
}
