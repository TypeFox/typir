/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type, isType } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { TypirProblem } from '../utils/utils-type-comparison.js';
import { assertUnreachable } from '../utils/utils.js';

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

/**
 * Represents a single rule for inference,
 * i.e. only a single type (or no type at all) can be inferred for a given domain element.
 */
export interface TypeInferenceRule {
    /**
     * 1st step is to check, whether this inference rule is applicable to the given domain element.
     * @param domainElement the element whose type shall be inferred
     * @returns the identified type (if it is already possible to determine the type)
     * or 'RULE_NOT_APPLICABLE' to indicate, that the current inference rule is not applicable for the given domain element at all,
     * or an inference problem,
     * or a list of domain elements, whose types need to be inferred, before this rule is able to decide, whether it is applicable.
     * Only in the last case, the other function will be called, otherwise, it is skipped (that is the reason, why it is optional).
     */
    isRuleApplicable(domainElement: unknown): Type | unknown[] | 'RULE_NOT_APPLICABLE' | InferenceProblem;

    /**
     * 2nd step is to finally decide about the inferred type.
     * When the 1st step returned a list of elements to resolve their types,
     * this function is mandatory, since it need to complete this inference rule, otherwise, this step is not called.
     * Advantage of this step is to split it to allow a postponed inferrence of the additional elements by Typir.
     * Disadvantage of this step is, that already checked TS types of domainElement cannot be reused.
     * @param domainElement the element whose type shall be inferred
     * @param childrenTypes the types which are inferred from the elements of the 1st step (in the same order!)
     * @returns the finally inferred type or a problem, why this inference rule is finally not applicable
     */
    inferType?(domainElement: unknown, childrenTypes: Array<Type | undefined>): Type | InferenceProblem
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
    readonly inferenceRules: TypeInferenceRule[] = [];
    protected cache: Map<unknown, Type | undefined> = new Map(); // TODO reset cache for updated Langium documents!
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

        // otherwise, check all rules
        const collectedInferenceProblems: InferenceProblem[] = [];
        for (const rule of this.inferenceRules) {
            const firstCheck = rule.isRuleApplicable(domainElement);
            if (firstCheck === 'RULE_NOT_APPLICABLE') {
                // this rule is not applicable at all => check the next rule
            } else if (isType(firstCheck)) {
                // the result type is already found!
                this.cacheSet(domainElement, firstCheck);
                return firstCheck;
            } else if (isInferenceProblem(firstCheck)) {
                // found some inference problems
                collectedInferenceProblems.push(firstCheck);
            } else if (Array.isArray(firstCheck)) {
                // this rule might match => continue applying this rule
                if (rule.inferType) {
                    // resolve the requested child types
                    const childElements = firstCheck;
                    const childTypes: Array<Type | InferenceProblem[]> = childElements.map(child => this.inferType(child));
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
                        const finalInferenceResult = rule.inferType(domainElement, childTypes as Type[]);
                        if (isType(finalInferenceResult)) {
                            // type is inferred!
                            this.cacheSet(domainElement, finalInferenceResult);
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
                assertUnreachable(firstCheck);
            }
        }
        this.pendingClear(domainElement);
        return collectedInferenceProblems;
    }

    addInferenceRule(rule: TypeInferenceRule): void {
        this.inferenceRules.push(rule);
    }

    protected cacheSet(domainElement: unknown, type: Type): void {
        this.pendingClear(domainElement);
        this.cache.set(domainElement, type);
    }

    protected cacheGet(domainElement: unknown): Type | undefined {
        if (this.pendingGet(domainElement)) {
            return undefined;
        } else {
            return this.cache.get(domainElement);
        }
    }

    protected pendingSet(domainElement: unknown): void {
        this.cache.set(domainElement, undefined);
    }
    protected pendingClear(domainElement: unknown): void {
        if (this.cache.get(domainElement) !== undefined) {
            // do nothing
        } else {
            this.cache.delete(domainElement);
        }
    }
    protected pendingGet(domainElement: unknown): boolean {
        return this.cache.has(domainElement) && this.cache.get(domainElement) === undefined;
    }
}
