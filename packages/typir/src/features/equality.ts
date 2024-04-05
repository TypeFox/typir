/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { assertUnreachable } from '../utils.js';
import { RelationshipKind, TypeRelationshipCaching } from './caching.js';

export interface TypeEquality {
    areTypesEqual(type1: Type, type2: Type): boolean;
}

export class DefaultTypeEquality implements TypeEquality {
    protected readonly typir: Typir;

    constructor(typir: Typir) {
        this.typir = typir;
    }

    areTypesEqual(type1: Type, type2: Type): boolean {
        if (type1 === type2) {
            return true;
        }
        if (type1.name === type2.name) {
            return true;
        }
        if (type1.kind !== type2.kind) {
            // equal types must have the same kind
            return false;
        }

        const cache: TypeRelationshipCaching = this.typir.caching;
        const link = cache.getRelationship(type1, type2, EQUAL_TYPE, false);

        const save = (value: RelationshipKind): void => {
            cache.setRelationship(type1, type2, EQUAL_TYPE, false, value);
        };

        // skip recursive checking
        if (link === 'PENDING') {
            return true; // is 'true' the correct result here? 'true' will be stored in the type graph ...
        }

        // the result is already known
        if (link === 'LINK_EXISTS') {
            return true;
        }
        if (link === 'NO_LINK') {
            return false;
        }

        // do the expensive calculation now
        if (link === 'UNKNOWN') {
            // mark the current relationship as PENDING to detect and resolve cycling checks
            save('PENDING');

            // do the real logic
            const result = type1.kind.areTypesEqual(type1, type2);

            // this allows to cache results (and to re-set the PENDING state)
            save(result ? 'LINK_EXISTS' : 'NO_LINK');
            return result;
        }
        assertUnreachable(link);
    }
}

const EQUAL_TYPE = 'areEqual';
