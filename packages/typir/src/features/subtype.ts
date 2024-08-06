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
    // TODO switch order of sub and super!!
    isSubType(superType: Type, subType: Type): boolean;
    getSubTypeProblem(superType: Type, subType: Type): SubTypeProblem | undefined;
}

export class DefaultSubType implements SubType {
    protected readonly typir: Typir;

    constructor(typir: Typir) {
        this.typir = typir;
    }

    isSubType(superType: Type, subType: Type): boolean {
        return this.getSubTypeProblem(superType, subType) === undefined;
    }

    getSubTypeProblem(superType: Type, subType: Type): SubTypeProblem | undefined {
        const cache: TypeRelationshipCaching = this.typir.caching.typeRelationships;

        const linkData = cache.getRelationship(subType, superType, SUB_TYPE, true);
        const linkRelationship = linkData.relationship;

        const save = (relationship: RelationshipKind, error: SubTypeProblem | undefined): void => {
            cache.setRelationship(subType, superType, SUB_TYPE, false, relationship, error);
        };

        // skip recursive checking
        if (linkRelationship === 'PENDING') {
            return undefined; // is 'undefined' the correct result here? TODO was passiert hier? 'true' will be stored in the type graph ...
        }

        // the result is already known
        if (linkRelationship === 'LINK_EXISTS') {
            return undefined;
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
            if (result === undefined) {
                save('LINK_EXISTS', undefined);
            } else {
                save('NO_LINK', result);
            }
            return result;
        }
        assertUnreachable(linkRelationship);
    }

    protected calculateSubType(superType: Type, subType: Type): SubTypeProblem | undefined {
        // compare the types: delegated to the kinds
        // 1st delegate to the kind of the sub type
        const resultSub = subType.kind.analyzeSubTypeProblems(superType, subType);
        if (resultSub.length <= 0) {
            return undefined;
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
        const resultSuper = superType.kind.analyzeSubTypeProblems(superType, subType);
        if (resultSuper.length <= 0) {
            return undefined;
        }
        return {
            superType,
            subType,
            subProblems: [...resultSuper, ...resultSub], // return the inference problems of both kinds
        };
    }
}

const SUB_TYPE = 'isSubTypeOf';
