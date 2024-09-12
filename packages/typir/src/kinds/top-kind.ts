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
import { createKindConflict } from '../utils/utils-type-comparison.js';
import { toArray } from '../utils/utils.js';
import { isKind, Kind } from './kind.js';

export class TopType extends Type {
    override readonly kind: TopKind;

    constructor(kind: TopKind, identifier: string) {
        super(identifier);
        this.kind = kind;
    }

    override getUserRepresentation(): string {
        return this.identifier;
    }

    override analyzeTypeEqualityProblems(otherType: Type): TypirProblem[] {
        if (isTopType(otherType)) {
            return [];
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
        if (isTopType(superType)) {
            // special case by definition: TopType is sub-type of TopType
            return [];
        } else {
            return [<SubTypeProblem>{
                $problem: SubTypeProblem,
                superType,
                subType: this,
                subProblems: [createKindConflict(superType, this)],
            }];
        }
    }

    override analyzeIsSuperTypeOf(_subType: Type): TypirProblem[] {
        // a TopType is the super type of all types!
        return [];
    }

}

export function isTopType(type: unknown): type is TopType {
    return isType(type) && isTopKind(type.kind);
}



export interface TopTypeDetails {
    /** In case of multiple inference rules, later rules are not evaluated anymore, if an earler rule already matched. */
    inferenceRules?: InferTopType | InferTopType[]
}

export interface TopKindOptions {
    name: string;
}

export type InferTopType = (domainElement: unknown) => boolean;

export const TopKindName = 'TopKind';

export class TopKind implements Kind {
    readonly $name: 'TopKind';
    readonly typir: Typir;
    readonly options: TopKindOptions;
    protected instance: TopType | undefined;

    constructor(typir: Typir, options?: Partial<TopKindOptions>) {
        this.$name = TopKindName;
        this.typir = typir;
        this.typir.registerKind(this);
        this.options = {
            // the default values:
            name: 'any',
            // the actually overriden values:
            ...options
        };
    }

    createTopType(typeDetails: TopTypeDetails): TopType {
        // create the top type (singleton)
        if (this.instance) {
            // note, that the given inference rules are ignored in this case!
            return this.instance;
        }
        const topType = new TopType(this, this.calculateIdentifier(typeDetails));
        this.instance = topType;
        this.typir.graph.addNode(topType);

        // register all inference rules for primitives within a single generic inference rule (in order to keep the number of "global" inference rules small)
        const rules = toArray(typeDetails.inferenceRules);
        if (rules.length >= 1) {
            this.typir.inference.addInferenceRule((domainElement, _typir) => {
                for (const inferenceRule of rules) {
                    if (inferenceRule(domainElement)) {
                        return topType;
                    }
                }
                return InferenceRuleNotApplicable;
            });
        }

        return topType;
    }

    calculateIdentifier(_typeDetails: TopTypeDetails): string {
        return this.options.name;
    }

}

export function isTopKind(kind: unknown): kind is TopKind {
    return isKind(kind) && kind.$name === TopKindName;
}
