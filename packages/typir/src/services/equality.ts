/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { assertUnreachable } from 'langium';
import type { Type } from '../graph/type-node.js';
import type { TypirServices } from '../typir.js';
import type { TypirProblem } from '../utils/utils-definitions.js';
import { isSpecificTypirProblem } from '../utils/utils-definitions.js';
import type {
    EdgeCachingInformation,
    TypeRelationshipCaching,
} from './caching.js';
import type { TypeEdge } from '../graph/type-edge.js';
import { isTypeEdge } from '../graph/type-edge.js';

export interface TypeEqualityProblem extends TypirProblem {
    $problem: 'TypeEqualityProblem';
    type1: Type;
    type2: Type;
    subProblems: TypirProblem[]; // might be empty
}
export const TypeEqualityProblem = 'TypeEqualityProblem';
export function isTypeEqualityProblem(
    problem: unknown,
): problem is TypeEqualityProblem {
    return isSpecificTypirProblem(problem, TypeEqualityProblem);
}

/**
 * Analyzes, whether there is an equality-relationship between two types.
 *
 * In contrast to type comparisons with type1 === type2 or type1.identifier === type2.identifier,
 * equality will take alias types and so on into account as well.
 */
export interface TypeEquality {
    areTypesEqual(type1: Type, type2: Type): boolean;
    getTypeEqualityProblem(
        type1: Type,
        type2: Type,
    ): TypeEqualityProblem | undefined;
}

export class DefaultTypeEquality<LanguageType> implements TypeEquality {
    protected readonly typeRelationships: TypeRelationshipCaching;

    constructor(services: TypirServices<LanguageType>) {
        this.typeRelationships = services.caching.TypeRelationships;
    }

    areTypesEqual(type1: Type, type2: Type): boolean {
        return this.getTypeEqualityProblem(type1, type2) === undefined;
    }

    getTypeEqualityProblem(
        type1: Type,
        type2: Type,
    ): TypeEqualityProblem | undefined {
        const cache: TypeRelationshipCaching = this.typeRelationships;
        const linkData = cache.getRelationshipBidirectional<EqualityEdge>(
            type1,
            type2,
            EqualityEdge,
        );
        const equalityCaching = linkData?.cachingInformation ?? 'UNKNOWN';

        function save(
            equalityCaching: EdgeCachingInformation,
            error: TypeEqualityProblem | undefined,
        ): void {
            const newEdge: EqualityEdge = {
                $relation: EqualityEdge,
                from: type1,
                to: type2,
                cachingInformation: 'LINK_EXISTS',
                error,
            };
            cache.setOrUpdateBidirectionalRelationship(
                newEdge,
                equalityCaching,
            );
        }

        // skip recursive checking
        if (equalityCaching === 'PENDING') {
            /** 'undefined' should be correct here ...
             * - since this relationship will be checked earlier/higher/upper in the call stack again
             * - since this values is not cached and therefore NOT reused in the earlier call! */
            return undefined;
        }

        // the result is already known
        if (equalityCaching === 'LINK_EXISTS') {
            return undefined;
        }
        if (equalityCaching === 'NO_LINK') {
            return {
                $problem: TypeEqualityProblem,
                type1,
                type2,
                subProblems: linkData?.error ? [linkData.error] : [],
            };
        }

        // do the expensive calculation now
        if (equalityCaching === 'UNKNOWN') {
            // mark the current relationship as PENDING to detect and resolve cycling checks
            save('PENDING', undefined);

            // do the actual calculation
            const result = this.calculateEquality(type1, type2);

            // this allows to cache results (and to re-set the PENDING state)
            if (result === undefined) {
                save('LINK_EXISTS', undefined);
            } else {
                save('NO_LINK', result);
            }
            return result;
        }
        assertUnreachable(equalityCaching);
    }

    protected calculateEquality(
        type1: Type,
        type2: Type,
    ): TypeEqualityProblem | undefined {
        if (type1 === type2) {
            return undefined;
        }
        if (type1.getIdentifier() === type2.getIdentifier()) {
            // this works, since identifiers are unique!
            return undefined;
        }

        // use the type-specific logic
        // ask the 1st type
        const result1 = type1.analyzeTypeEqualityProblems(type2);
        if (result1.length <= 0) {
            return undefined;
        }
        // ask the 2nd type
        const result2 = type2.analyzeTypeEqualityProblems(type1);
        if (result2.length <= 0) {
            return undefined;
        }
        // both types reported, that they are diffferent
        return {
            $problem: TypeEqualityProblem,
            type1,
            type2,
            subProblems: [...result1, ...result2], // return the equality problems of both types
        };
    }
}

export interface EqualityEdge extends TypeEdge {
    readonly $relation: 'EqualityEdge';
    readonly error: TypeEqualityProblem | undefined;
}
export const EqualityEdge = 'EqualityEdge';

export function isEqualityEdge(edge: unknown): edge is EqualityEdge {
    return isTypeEdge(edge) && edge.$relation === EqualityEdge;
}
