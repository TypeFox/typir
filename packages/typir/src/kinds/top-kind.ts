/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { InferenceRuleNotApplicable } from '../features/inference.js';
import { SubTypeProblem } from '../features/subtype.js';
import { Type } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { TypirProblem, compareValueForConflict } from '../utils/utils-type-comparison.js';
import { toArray } from '../utils/utils.js';
import { Kind, isKind } from './kind.js';

export interface TopKindOptions {
    name: string;
}

export type InferTopType = (domainElement: unknown) => boolean;

export const TopKindName = 'TopKind';

export class TopKind implements Kind {
    readonly $name: 'TopKind';
    readonly typir: Typir;
    readonly options: TopKindOptions;
    protected instance: Type | undefined;

    constructor(typir: Typir, options?: Partial<TopKindOptions>) {
        this.$name = 'TopKind';
        this.typir = typir;
        this.typir.registerKind(this);
        this.options = {
            // the default values:
            name: 'any',
            // the actually overriden values:
            ...options
        };
    }

    createTopType(typeDetails: {
        /** In case of multiple inference rules, later rules are not evaluated anymore, if an earler rule already matched. */
        inferenceRules?: InferTopType | InferTopType[]
    }): Type {
        // create the top type (singleton)
        if (this.instance) {
            // note, that the given inference rules are ignored in this case!
            return this.instance;
        }
        const topType = new Type(this, this.options.name);
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

    getUserRepresentation(type: Type): string {
        return type.name;
    }

    isSubType(superType: Type, subType: Type): TypirProblem[] {
        if (isTopKind(superType.kind)) {
            return [];
        }
        if (isTopKind(subType.kind)) {
            return [<SubTypeProblem>{
                superType,
                subType,
                subProblems: [], // TODO better error message?
            }];
        }
        return [<SubTypeProblem>{
            superType,
            subType,
            subProblems: compareValueForConflict(superType.kind.$name, subType.kind.$name, 'kind'),
        }];
    }

    areTypesEqual(type1: Type, type2: Type): TypirProblem[] {
        if (isTopKind(type1.kind) && isTopKind(type2.kind)) {
            return [];
        }
        throw new Error();
    }
}

export function isTopKind(kind: unknown): kind is TopKind {
    return isKind(kind) && kind.$name === TopKindName;
}
