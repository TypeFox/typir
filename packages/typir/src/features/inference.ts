/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type, isType } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { assertUnreachable } from '../utils/utils.js';

/**
 * Represents a single rule for inference,
 * i.e. only a single type (or no type at all) can be inferred for a given domain element.
 */
export interface TypeInferenceRule {
    /**
     * 1st step is to check, whether this inference rule is applicable to the given domain element.
     * @param domainElement the element whose type shall be inferred
     * @returns the identified type (if it is already possible to determine the type)
     * or false to indicate, that the current inference rule is not applicable for the given domain element,
     * or a list of domain elements, whose types need to be inferred, before this rule is able to decide, whether it is applicable.
     * Only in the last case, the other function will be called, otherwise, it is skipped (that is the reason, why it is optional).
     */
    isRuleApplicable(domainElement: unknown): Type | false | unknown[];

    // TODO daraus Fehlermeldungen ableiten bzw. das nächst-beste Match finden??

    /**
     * 2nd step is to finally decide about the inferred type.
     * When the 1st step returned a list of elements to resolve their types,
     * this function is mandatory, since it need to complete this inference rule, otherwise, this step is not called.
     * Advantage of this step is to split it to allow a postponed inferrence of the additional elements by Typir.
     * Disadvantage of this step is, that already checked TS types of domainElement cannot be reused.
     * @param domainElement the element whose type shall be inferred
     * @param childrenTypes the types which are inferred from the elements of the 1st step (in the same order!)
     * @returns the finally inferred type or undefined, when this inference rule is finally not applicable
     */
    inferType?(domainElement: unknown, childrenTypes: Array<Type | undefined>): Type | undefined
}

/** Represents the signature to determine whether a domain element has a particular type.
 * This type/signature is a utility to formulate inference rules for dedicated semantic types.
 */
export type InferConcreteType = (domainElement: unknown, typeName: string) => boolean;

/**
 * Collects an arbitrary number of inference rules
 * and allows to infer a type for a given domain element.
 */
export interface TypeInferenceCollector {
    inferType(domainElement: unknown): Type | undefined
    addInferenceRule(rule: TypeInferenceRule): void;
}

export class DefaultTypeInferenceCollector implements TypeInferenceCollector {
    readonly inferenceRules: TypeInferenceRule[] = [];
    protected readonly typir: Typir;

    constructor(typir: Typir) {
        this.typir = typir;
    }

    inferType(domainElement: unknown): Type | undefined {
        for (const rule of this.inferenceRules) {
            const firstCheck = rule.isRuleApplicable(domainElement);
            if (firstCheck === false) {
                // this rule is not applicable at all => check the next rule
            } else if (isType(firstCheck)) {
                // the result type is already found!
                return firstCheck;
            } else if (Array.isArray(firstCheck)) {
                // this rule might match => continue using this rule
                if (rule.inferType) {
                    // resolve the given child types
                    const childElements = firstCheck;
                    const childTypes: Array<Type | undefined> = childElements.map(child => this.inferType(child)); // TODO handle recursion loops!
                    const result = rule.inferType(domainElement, childTypes);
                    if (result) {
                        // type is inferred!
                        return result;
                    } else {
                        // inference is not applicable (probably due to a mismatch of the children's types) => check the next rule
                    }
                } else {
                    throw new Error('missing implementation for "inferType(...)" in this inference rule');
                }
            } else {
                assertUnreachable(firstCheck);
            }
        }
        return undefined;
    }

    addInferenceRule(rule: TypeInferenceRule): void {
        this.inferenceRules.push(rule);
    }
}
