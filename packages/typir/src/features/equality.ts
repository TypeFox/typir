/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { assertUnreachable } from 'langium';
import { Type, isType } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { TypirProblem } from '../utils/utils-definitions.js';
import { RelationshipKind, TypeRelationshipCaching } from './caching.js';

export interface TypeEqualityProblem {
    type1: Type;
    type2: Type;
    subProblems: TypirProblem[]; // might be empty
}
export function isTypeEqualityProblem(problem: unknown): problem is TypeEqualityProblem {
    return typeof problem === 'object' && problem !== null && isType((problem as TypeEqualityProblem).type1) && isType((problem as TypeEqualityProblem).type2);
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
        const linkData = cache.getRelationship(type1, type2, EQUAL_TYPE, false);
        const linkRelationship = linkData.relationship;

        const save = (relationship: RelationshipKind, error: TypeEqualityProblem | undefined): void => {
            cache.setRelationship(type1, type2, EQUAL_TYPE, false, relationship, error);
        };

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
                type1,
                type2,
                subProblems: isTypeEqualityProblem(linkData.additionalData) ? [linkData.additionalData] : [],
            };
        }

        // do the expensive calculation now
        if (linkRelationship === 'UNKNOWN') {
            // mark the current relationship as PENDING to detect and resolve cycling checks
            save('PENDING', undefined);

            // do the real logic
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
            type1,
            type2,
            subProblems: [...result1, ...result2] // return the equality problems of both types
        };
    }

}

const EQUAL_TYPE = 'areEqual';
