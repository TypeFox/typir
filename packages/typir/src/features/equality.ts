/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { assertUnreachable } from 'langium';
import { Type, isType } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { TypirProblem, compareValueForConflict } from '../utils/utils-type-comparison.js';
import { RelationshipKind, TypeRelationshipCaching } from './caching.js';

export interface TypeEqualityProblem {
    type1: Type;
    type2: Type;
    subProblems: TypirProblem[]; // might be empty
}
export function isTypeEqualityProblem(problem: unknown): problem is TypeEqualityProblem {
    return typeof problem === 'object' && problem !== null && isType((problem as TypeEqualityProblem).type1) && isType((problem as TypeEqualityProblem).type2);
}

export interface TypeEquality {
    areTypesEqual(type1: Type, type2: Type): true | TypeEqualityProblem;
}

export class DefaultTypeEquality implements TypeEquality {
    protected readonly typir: Typir;

    constructor(typir: Typir) {
        this.typir = typir;
    }

    areTypesEqual(type1: Type, type2: Type): true | TypeEqualityProblem {
        const cache: TypeRelationshipCaching = this.typir.caching.typeRelationships;
        const linkData = cache.getRelationship(type1, type2, EQUAL_TYPE, false);
        const linkRelationship = linkData.relationship;

        const save = (relationship: RelationshipKind, error: TypeEqualityProblem | undefined): void => {
            cache.setRelationship(type1, type2, EQUAL_TYPE, false, relationship, error);
        };

        // skip recursive checking
        if (linkRelationship === 'PENDING') {
            return true; // is 'true' the correct result here? 'true' will be stored in the type graph ...
        }

        // the result is already known
        if (linkRelationship === 'LINK_EXISTS') {
            return true;
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
            if (result === true) {
                save('LINK_EXISTS', undefined);
            } else {
                save('NO_LINK', result);
            }
            return result;
        }
        assertUnreachable(linkRelationship);
    }

    protected calculateEquality(type1: Type, type2: Type): true | TypeEqualityProblem {
        if (type1 === type2) {
            return true;
        }
        if (type1.name === type2.name) { // this works, since names are unique!
            return true;
        }

        const kindComparisonResult = compareValueForConflict(type1.kind.$name, type2.kind.$name, 'kind');
        if (kindComparisonResult.length >= 1) {
            // equal types must have the same kind
            return {
                type1,
                type2,
                subProblems: kindComparisonResult
            };
        } else {
            // compare the types: delegated to the kind
            const kindResult = type1.kind.areTypesEqual(type1, type2);
            if (kindResult.length >= 1) {
                return {
                    type1,
                    type2,
                    subProblems: kindResult
                };
            } else {
                return true;
            }
        }
    }
}

const EQUAL_TYPE = 'areEqual';
