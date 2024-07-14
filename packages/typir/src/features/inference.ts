/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type, isType } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { TypirProblem } from '../utils/utils-type-comparison.js';

export interface InferenceProblem {
    domainElement: unknown;
    inferenceCandidate?: Type;
    location: string;
    rule?: TypeInferenceRule; // for debugging only, since rules have no names (so far)
    subProblems: TypirProblem[]; // might be missing or empty
}
export function isInferenceProblem(problem: unknown): problem is InferenceProblem {
    return typeof problem === 'object' && problem !== null && typeof (problem as InferenceProblem).location === 'string' && (problem as InferenceProblem).domainElement !== undefined;
}

// Type and Value to indicate, that an inference rule is intended for another case, and therefore is unable to infer a type for the current case.
export type InferenceRuleNotApplicable = 'N/A'; // or 'undefined' instead?
export const InferenceRuleNotApplicable = 'N/A'; // or 'undefined' instead?

export type TypeInferenceResult = Type | InferenceRuleNotApplicable | unknown | InferenceProblem;

// TODO support this variant as simplification
export type TypeInferenceRuleSimple = (domainElement: unknown, typir: Typir) => TypeInferenceResult;

/**
 * Represents a single rule for inference,
 * i.e. only a single type (or no type at all) can be inferred for a given domain element.
 */
export interface TypeInferenceRule {
    /**
     * 1st step is to check, whether this inference rule is applicable to the given domain element.
     * @param domainElement the element whose type shall be inferred
     * @param typir the current Typir instance
     * @returns the identified type (if it is already possible to determine the type)
     * or 'N/A' to indicate, that the current inference rule is not applicable for the given domain element at all,
     * or a domain element whose type should be inferred instead,
     * or an inference problem,
     * or a list of domain elements, whose types need to be inferred, before this rule is able to decide, whether it is applicable.
     * Only in the last case, the other function will be called, otherwise, it is skipped (that is the reason, why it is optional).
     */
    isRuleApplicable(domainElement: unknown, typir: Typir): TypeInferenceResult | unknown[];

    /**
     * 2nd step is to finally decide about the inferred type.
     * When the 1st step returned a list of elements to resolve their types,
     * this function is mandatory, since it need to complete this inference rule, otherwise, this step is not called.
     * Advantage of this step is to split it to allow a postponed inferrence of the additional elements by Typir.
     * Disadvantage of this step is, that already checked TS types of domainElement cannot be reused.
     * @param domainElement the element whose type shall be inferred
     * @param childrenTypes the types which are inferred from the elements of the 1st step (in the same order!)
     * @param typir the current Typir instance
     * @returns the finally inferred type or a problem, why this inference rule is finally not applicable
     */
    inferType?(domainElement: unknown, childrenTypes: Array<Type | undefined>, typir: Typir): Type | InferenceProblem
}

/**
 * This inference rule uses multiple internal inference rules for doing the type inference.
 * If one of the child rules returns a type, this type is the result of the composite rule.
 * Otherwise, all problems of all child rules are returned.
 */
export class CompositeTypeInferenceRule implements TypeInferenceRule {
    readonly subRules: TypeInferenceRule[] = [];

    isRuleApplicable(domainElement: unknown, typir: Typir): TypeInferenceResult | unknown[] {
        class FunctionInference extends DefaultTypeInferenceCollector {
            // do not check "pending" (again), since it is already checked by the "parent" DefaultTypeInferenceCollector!
            override pendingGet(_domainElement: unknown): boolean {
                return false;
            }
        }
        const infer = new FunctionInference(typir);
        this.subRules.forEach(r => infer.addInferenceRule(r));

        // do the type inference
        const result = infer.inferType(domainElement);
        if (isType(result)) {
            return result;
        } else {
            if (result.length <= 0) {
                return InferenceRuleNotApplicable;
            } else if (result.length === 1) {
                return result[0];
            } else {
                return <InferenceProblem>{
                    domainElement,
                    location: 'sub-rules for inference',
                    rule: this,
                    subProblems: result,
                };
            }
        }
    }

    inferType?(_domainElement: unknown, _childrenTypes: Array<Type | undefined>, _typir: Typir): Type | InferenceProblem {
        throw new Error('This function will not be called.');
    }
}

/**
 * Collects an arbitrary number of inference rules
 * and allows to infer a type for a given domain element.
 */
export interface TypeInferenceCollector {
    /**
     * Infers a type for the given element.
     * @param domainElement the element whose type shall be inferred
     * @returns the found Type or some inference problems (might be empty), when none of the inference rules were able to infer a type
     */
    inferType(domainElement: unknown): Type | InferenceProblem[]

    /**
     * Registers an inference rule.
     * When inferring the type for an element, all registered inference rules are checked until the first match.
     * @param rule a new inference rule
     */
    addInferenceRule(rule: TypeInferenceRule): void;
}

export class DefaultTypeInferenceCollector implements TypeInferenceCollector {
    protected readonly inferenceRules: TypeInferenceRule[] = [];
    protected readonly typir: Typir;

    constructor(typir: Typir) {
        this.typir = typir;
    }

    inferType(domainElement: unknown): Type | InferenceProblem[] {
        // is the result already in the cache?
        const cached = this.cacheGet(domainElement);
        if (cached) {
            return cached;
        }

        // handle recursion loops
        if (this.pendingGet(domainElement)) {
            throw new Error(`There is a recursion loop for inferring the type from ${domainElement}! Probably, there are multiple interfering inference rules.`);
        }
        this.pendingSet(domainElement);

        // do the actual type inference
        const result = this.inferTypeLogic(domainElement);

        // the calculation is done
        this.pendingClear(domainElement);

        // remember the calculated type in the cache
        if (isType(result)) {
            this.cacheSet(domainElement, result);
        }
        return result;
    }

    protected inferTypeLogic(domainElement: unknown): Type | InferenceProblem[] {
        // otherwise, check all rules
        const collectedInferenceProblems: InferenceProblem[] = [];
        for (const rule of this.inferenceRules) {
            const firstCheck = rule.isRuleApplicable(domainElement, this.typir);
            if (firstCheck === InferenceRuleNotApplicable) {
                // this rule is not applicable at all => check the next rule
            } else if (isType(firstCheck)) {
                // the result type is already found!
                return firstCheck;
            } else if (isInferenceProblem(firstCheck)) {
                // found some inference problems
                collectedInferenceProblems.push(firstCheck);
            } else if (Array.isArray(firstCheck)) {
                // this rule might match => continue applying this rule
                if (rule.inferType) {
                    // resolve the requested child types
                    const childElements = firstCheck;
                    const childTypes: Array<Type | InferenceProblem[]> = childElements.map(child => this.typir.inference.inferType(child));
                    // check, whether inferring the children resulted in some other inference problems
                    const childTypeProblems: InferenceProblem[] = [];
                    for (let i = 0; i < childTypes.length; i++) {
                        const child = childTypes[i];
                        if (Array.isArray(child)) {
                            childTypeProblems.push({
                                domainElement: childElements[i],
                                location: `child element ${i}`,
                                rule,
                                subProblems: child,
                            });
                        }
                    }
                    if (childTypeProblems.length >= 1) {
                        collectedInferenceProblems.push({
                            domainElement,
                            location: 'inferring depending children',
                            rule,
                            subProblems: childTypeProblems,
                        });
                    } else {
                        // the types of all children are successfully inferred
                        const finalInferenceResult = rule.inferType(domainElement, childTypes as Type[], this.typir);
                        if (isType(finalInferenceResult)) {
                            // type is inferred!
                            return finalInferenceResult;
                        } else {
                            // inference is not applicable (probably due to a mismatch of the children's types) => check the next rule
                            collectedInferenceProblems.push(finalInferenceResult);
                        }
                    }
                } else {
                    throw new Error('missing implementation for "inferType(...)" in this inference rule');
                }
            } else {
                // this domain element is used instead to infer its type, which is the type for the current domain element as well
                return this.typir.inference.inferType(firstCheck);
            }
        }
        return collectedInferenceProblems;
    }

    addInferenceRule(rule: TypeInferenceRule): void {
        this.inferenceRules.push(rule);
    }

    /* By default, the central cache of Typir is used. */

    protected cacheSet(domainElement: unknown, type: Type): void {
        this.typir.caching.domainElementInference.cacheSet(domainElement, type);
    }

    protected cacheGet(domainElement: unknown): Type | undefined {
        return this.typir.caching.domainElementInference.cacheGet(domainElement);
    }

    protected pendingSet(domainElement: unknown): void {
        this.typir.caching.domainElementInference.pendingSet(domainElement);
    }
    protected pendingClear(domainElement: unknown): void {
        this.typir.caching.domainElementInference.pendingClear(domainElement);
    }
    protected pendingGet(domainElement: unknown): boolean {
        return this.typir.caching.domainElementInference.pendingGet(domainElement);
    }
}
