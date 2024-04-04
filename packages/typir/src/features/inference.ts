/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type } from '../graph/type-node.js';
import { Typir } from '../typir.js';

export interface TypeInferenceRule {
    /**
     * 1st step is
     * @param domainElement the element whose type shall be inferred
     * @returns the identified type
     * or false to indicate, that the current inference rule is not applicable for the given domain element,
     * or true, that TODO
     * In case of 'true', the other two functions will be called.
     */
    isRuleApplicable(domainElement: unknown): Type | boolean;

    /**
     * 2nd step is
     * + split it to allow a postponed calculation
     * - TS type of domainElement cannot be reused
     * @param domainElement the element whose type shall be inferred
     * @returns
     */
    getElementsToInferBefore?(domainElement: unknown): unknown[];

    /**
     * 3rd step is
     * @param domainElement the element whose type shall be inferred
     * @param childrenTypes 
     * @returns
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
                    const childTypes: Array<Type | undefined> = rule.getElementsToInferBefore ? rule.getElementsToInferBefore(domainElement).map(child => this.inferType(child)) : [];
                    const result = rule.inferType(domainElement, childTypes); // TODO handle recursion loops!
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
