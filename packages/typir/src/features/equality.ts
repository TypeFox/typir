/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { assertUnreachable } from 'langium';
import { Type } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { isConcreteTypirProblem, TypirProblem } from '../utils/utils-definitions.js';
import { CachingKind, TypeRelationshipCaching } from './caching.js';
import { isTypeEdge, TypeEdge } from '../graph/type-edge.js';

export interface TypeEqualityProblem extends TypirProblem {
    $problem: 'TypeEqualityProblem';
    type1: Type;
    type2: Type;
    subProblems: TypirProblem[]; // might be empty
}
export const TypeEqualityProblem = 'TypeEqualityProblem';
export function isTypeEqualityProblem(problem: unknown): problem is TypeEqualityProblem {
    return isConcreteTypirProblem(problem, TypeEqualityProblem);
}

// TODO comments
export interface TypeEquality {
    areTypesEqual(type1: Type, type2: Type): boolean;
    getTypeEqualityProblem(type1: Type, type2: Type): TypeEqualityProblem | undefined;
}

export class DefaultTypeEquality implements TypeEquality {
    protected readonly typir: Typir;

    constructor(typir: Typir) {
        this.typir = typir;
    }

    areTypesEqual(type1: Type, type2: Type): boolean {
        return this.getTypeEqualityProblem(type1, type2) === undefined;
    }

    getTypeEqualityProblem(type1: Type, type2: Type): TypeEqualityProblem | undefined {
        const cache: TypeRelationshipCaching = this.typir.caching.typeRelationships;
        const linkData = cache.getRelationship<EqualityEdge>(type1, type2, EqualityEdge, false);
        const linkRelationship = linkData?.cachingInformation ?? 'UNKNOWN';

        function save(relationship: CachingKind, error: TypeEqualityProblem | undefined): void {
            const newEdge: EqualityEdge = {
                $meaning: EqualityEdge,
                from: type1,
                to: type2,
                error,
            };
            cache.setOrUpdateRelationship(newEdge, false, relationship);
        }

        // skip recursive checking
        if (linkRelationship === 'PENDING') {
            /** 'undefined' should be correct here ...
             * - since this relationship will be checked earlier/higher/upper in the call stack again
             * - since this values is not cached and therefore NOT reused in the earlier call! */
            return undefined;
        }

        // the result is already known
        if (linkRelationship === 'LINK_EXISTS') {
            return undefined;
        }
        if (linkRelationship === 'NO_LINK') {
            return {
                $problem: TypeEqualityProblem,
                type1,
                type2,
                subProblems: linkData?.error ? [linkData.error] : [],
            };
        }

        // do the expensive calculation now
        if (linkRelationship === 'UNKNOWN') {
            // mark the current relationship as PENDING to detect and resolve cycling checks
            save('PENDING', undefined);

            // do the real calculation
            const result = this.calculateEquality(type1, type2);

            // this allows to cache results (and to re-set the PENDING state)
            if (result === undefined) {
                save('LINK_EXISTS', undefined);
            } else {
                save('NO_LINK', result);
            }
            return result;
        }
        assertUnreachable(linkRelationship);
    }

    protected calculateEquality(type1: Type, type2: Type): TypeEqualityProblem | undefined {
        if (type1 === type2) {
            return undefined;
        }
        if (type1.identifier === type2.identifier) { // this works, since identifiers are unique!
            return undefined;
        }

        // use the type-specific logic
        // ask the 1st type
        const result1 = type1.analyzeTypeEqualityProblems(type2);
        if (result1.length <= 0) {
            return undefined;
        }
        if (type1.kind.$name === type2.kind.$name) {
            // if type1 and type2 have the same kind, there is no need to check the same kind twice
            // TODO does this make sense?
            return {
                $problem: TypeEqualityProblem,
                type1,
                type2,
                subProblems: result1,
            };
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
            subProblems: [...result1, ...result2] // return the equality problems of both types
        };
    }

}

export interface EqualityEdge extends TypeEdge {
    readonly $meaning: 'EqualityEdge';
    readonly error: TypeEqualityProblem | undefined;
}
export const EqualityEdge = 'EqualityEdge';

export function isEqualityEdge(edge: unknown): edge is EqualityEdge {
    return isTypeEdge(edge) && edge.$meaning === EqualityEdge;
}
