/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { assertUnreachable } from 'langium';
import { isTypeEdge, TypeEdge } from '../graph/type-edge.js';
import { Type } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { isConcreteTypirProblem, TypirProblem } from '../utils/utils-definitions.js';
import { EdgeCachingInformation, TypeRelationshipCaching } from './caching.js';

export interface SubTypeProblem extends TypirProblem {
    $problem: 'SubTypeProblem';
    // 'undefined' means type or information is missing, 'string' is for data which are no Types
    superType: Type;
    subType: Type;
    subProblems: TypirProblem[]; // might be empty
}
export const SubTypeProblem = 'SubTypeProblem';
export function isSubTypeProblem(problem: unknown): problem is SubTypeProblem {
    return isConcreteTypirProblem(problem, SubTypeProblem);
}

// TODO new feature: allow to mark arbitrary types with a sub-type edge! (similar to conversion!)

/**
 * Analyzes, whether there is a sub type-relationship between two types.
 *
 * The sub-type relationship might be direct or indirect (transitive).
 * If both types are the same, no problems will be reported, since a type is considered as sub-type of itself (by definition).
 *
 * In theory, the difference between sub type-relationships and super type-relationships are only switched types.
 * But in practise, the default implementation will ask both involved types (if they have different kinds),
 * whether there is a sub type-relationship respectively a super type-relationship.
 * If at least one type reports a relationship, a sub type-relationship is assumed.
 * This simplifies the implementation of TopTypes and the implementation of new types (or customization of existing types),
 * since unchanged types don't need to be customized to report sub type-relationships accordingly.
 */
export interface SubType {
    isSubType(subType: Type, superType: Type): boolean;
    /* TODO:
    - no problem ==> sub-type relationship exists
    - terminology: "no sub-type" is not a problem in general ("it is a qualified NO"), it is just a property! This is a general issue of the current design!
    */
    getSubTypeProblem(subType: Type, superType: Type): SubTypeProblem | undefined;
}

export class DefaultSubType implements SubType {
    protected readonly typir: Typir;

    constructor(typir: Typir) {
        this.typir = typir;
    }

    isSubType(subType: Type, superType: Type): boolean {
        return this.getSubTypeProblem(subType, superType) === undefined;
    }

    getSubTypeProblem(subType: Type, superType: Type): SubTypeProblem | undefined {
        const cache: TypeRelationshipCaching = this.typir.caching.typeRelationships;
        const linkData = cache.getRelationshipUnidirectional<SubTypeEdge>(subType, superType, SubTypeEdge);
        const subTypeCaching = linkData?.cachingInformation ?? 'UNKNOWN';

        function save(subTypeCaching: EdgeCachingInformation, error: SubTypeProblem | undefined): void {
            const newEdge: SubTypeEdge = {
                $relation: SubTypeEdge,
                from: subType,
                to: superType,
                cachingInformation: 'LINK_EXISTS',
                error,
            };
            cache.setOrUpdateUnidirectionalRelationship(newEdge, subTypeCaching);
        }

        // skip recursive checking
        if (subTypeCaching === 'PENDING') {
            /** 'undefined' should be correct here ...
             * - since this relationship will be checked earlier/higher/upper in the call stack again
             * - since this values is not cached and therefore NOT reused in the earlier call! */
            return undefined;
        }

        // the result is already known
        if (subTypeCaching === 'LINK_EXISTS') {
            return undefined;
        }
        if (subTypeCaching === 'NO_LINK') {
            return {
                $problem: SubTypeProblem,
                superType,
                subType,
                subProblems: linkData?.error ? [linkData.error] : [],
            };
        }

        // do the expensive calculation now
        if (subTypeCaching === 'UNKNOWN') {
            // mark the current relationship as PENDING to detect and resolve cycling checks
            save('PENDING', undefined);

            // do the actual calculation
            const result = this.calculateSubType(subType, superType);

            // this allows to cache results (and to re-set the PENDING state)
            if (result === undefined) {
                save('LINK_EXISTS', undefined);
            } else {
                save('NO_LINK', result);
            }
            return result;
        }
        assertUnreachable(subTypeCaching);
    }

    protected calculateSubType(subType: Type, superType: Type): SubTypeProblem | undefined {
        /** Approach:
         * - delegate the calculation to the types, since they realize type-specific sub-type checking
         * - Therefore, it is not necessary to add special cases for TopType and BottomType here (e.g. if (isTopType(superType)) { return undefined; }).
         * - Additionally, this allows users of Typir to implement top/bottom types on their own without changing this implementation here!
         */

        // 1st delegate to the kind of the sub type
        const resultSub = subType.analyzeIsSubTypeOf(superType);
        if (resultSub.length <= 0) {
            return undefined;
        }

        // 2nd delegate to the kind of the super type
        const resultSuper = superType.analyzeIsSuperTypeOf(subType);
        if (resultSuper.length <= 0) {
            return undefined;
        }
        return {
            $problem: SubTypeProblem,
            superType,
            subType,
            subProblems: [...resultSuper, ...resultSub], // return the sub-type problems of both types
        };
    }
}

export interface SubTypeEdge extends TypeEdge {
    readonly $relation: 'SubTypeEdge';
    readonly error: SubTypeProblem | undefined;
}
export const SubTypeEdge = 'SubTypeEdge';

export function isSubTypeEdge(edge: unknown): edge is SubTypeEdge {
    return isTypeEdge(edge) && edge.$relation === SubTypeEdge;
}
