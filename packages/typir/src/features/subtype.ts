/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { assertUnreachable } from 'langium';
import { Type, isType } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { TypirProblem } from '../utils/utils-type-comparison.js';
import { RelationshipKind, TypeRelationshipCaching } from './caching.js';

export interface SubTypeProblem {
    // 'undefined' means type or information is missing, 'string' is for data which are no Types
    superType: Type;
    subType: Type;
    subProblems: TypirProblem[]; // might be empty
}
export function isSubTypeProblem(problem: unknown): problem is SubTypeProblem {
    return typeof problem === 'object' && problem !== null && isType((problem as SubTypeProblem).superType) && isType((problem as SubTypeProblem).subType);
}

export interface SubType {
    isSubType(superType: Type, subType: Type): true | SubTypeProblem;
}

export class DefaultSubType implements SubType {
    protected readonly typir: Typir;

    constructor(typir: Typir) {
        this.typir = typir;
    }

    isSubType(superType: Type, subType: Type): true | SubTypeProblem {
        const cache: TypeRelationshipCaching = this.typir.caching.typeRelationships;

        const linkData = cache.getRelationship(subType, superType, SUB_TYPE, true);
        const linkRelationship = linkData.relationship;

        const save = (relationship: RelationshipKind, error: SubTypeProblem | undefined): void => {
            cache.setRelationship(subType, superType, SUB_TYPE, false, relationship, error);
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
                superType,
                subType,
                subProblems: isSubTypeProblem(linkData.additionalData) ? [linkData.additionalData] : [],
            };
        }

        // do the expensive calculation now
        if (linkRelationship === 'UNKNOWN') {
            // mark the current relationship as PENDING to detect and resolve cycling checks
            save('PENDING', undefined);

            // do the real logic
            const result = this.calculateSubType(superType, subType);

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

    protected calculateSubType(superType: Type, subType: Type): true | SubTypeProblem {
        // compare the types: delegated to the kinds
        // 1st delegate to the kind of the sub type
        const resultSub = subType.kind.isSubType(superType, subType);
        if (resultSub.length <= 0) {
            return true;
        }
        if (superType.kind.$name === subType.kind.$name) {
            // if sub type and super type have the same kind, there is no need to check the same kind twice
            return {
                superType,
                subType,
                subProblems: resultSub,
            };
        }
        // 2nd delegate to the kind of the super type
        const resultSuper = superType.kind.isSubType(superType, subType);
        if (resultSuper.length <= 0) {
            return true;
        }
        return {
            superType,
            subType,
            subProblems: [...resultSuper, ...resultSub], // return the inference problems of both kinds
        };
    }
}

const SUB_TYPE = 'isSubTypeOf';
