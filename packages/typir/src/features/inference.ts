/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type } from '../graph/type-node.js';
import { Typir } from '../typir.js';

export interface TypeInferenceRule {
    /**
     * 1st step is TODO
     * @param domainElement the element whose type shall be inferred
     * @returns the identified type (if it is already possible to determine the type)
     * or false to indicate, that the current inference rule is not applicable for the given domain element,
     * or true, that this rule might be applicable, but TODO
     * Only in case of 'true', the other two functions will be called, otherwise, they are skipped (that is the reason, why they are optional).
     */
    isRuleApplicable(domainElement: unknown): Type | boolean;

    // TODO lassen sich diese beiden Functionen zusammenfassen?

    /**
     * 2nd step is TODO
     * Advantage of this step is to split it to allow a postponed inferrence of the additional elements by Typir.
     * Disadvantage of this step is, that already checked TS types of domainElement cannot be reused.
     * This function is optional in all cases.
     * @param domainElement the element whose type shall be inferred
     * @returns
     */
    getElementsToInferBefore?(domainElement: unknown): unknown[];

    /**
     * 3rd step is TODO
     * When the 1st step returned 'true', this function is mandatory, since it need to complete this inference rule, otherwise, this step is not called.
     * @param domainElement the element whose type shall be inferred
     * @param childrenTypes the types which are inferred from the elements of the 2nd step (in the same order!)
     * @returns the finally inferred type or undefined
     */
    inferType?(domainElement: unknown, childrenTypes: Array<Type | undefined>): Type | undefined
}

/** Represents the signature to determine whether a domain element has a particular type.
 * This type/signature is a utility to formulate inference rules for dedicated semantic types.
 */
export type InferConcreteType = (domainElement: unknown) => boolean;
export function createInferenceRuleWithoutChildren(rule: InferConcreteType, concreteType: Type): TypeInferenceRule {
    return {
        isRuleApplicable(domainElement) {
            return rule(domainElement) ? concreteType : false;
        }
    };
}

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
            } else if (firstCheck === true) {
                // this rule might match => continue using this rule
                if (rule.inferType) {
                    // resolve child types
                    const childElements = rule.getElementsToInferBefore ? rule.getElementsToInferBefore(domainElement) : [];
                    const childTypes: Array<Type | undefined> = childElements.map(child => this.inferType(child)); // TODO handle recursion loops!
                    const result = rule.inferType(domainElement, childTypes);
                    if (result) {
                        // type is inferred!
                        return result;
                    } else {
                        // inference is not applicable (probably due to a mismatch of the children's types) => check the next rule
                    }
                } else {
                    throw new Error('missing implementation for "inferType" in this inference rule');
                }
            } else {
                // the result type is already found!
                return firstCheck;
            }
        }
        return undefined;
    }

    addInferenceRule(rule: TypeInferenceRule): void {
        this.inferenceRules.push(rule);
    }
}
