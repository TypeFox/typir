/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { assertUnreachable } from 'langium';
import { Type } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { RelationshipKind, TypeRelationshipCaching } from './caching.js';
import { TypeConflict, createConflict } from '../utils/utils-type-comparison.js';

export interface SubType {
    isSubType(superType: Type, subType: Type): TypeConflict[];
}

export class DefaultSubType implements SubType {
    protected readonly typir: Typir;

    constructor(typir: Typir) {
        this.typir = typir;
    }

    isSubType(superType: Type, subType: Type): TypeConflict[] {
        if (superType.kind.$name !== subType.kind.$name) {
            // sub-types need to have the same kind
            return [createConflict(superType.kind.$name, subType.kind.$name, 'kind')];
        }
        const cache: TypeRelationshipCaching = this.typir.caching;

        const link = cache.getRelationship(subType, superType, SUB_TYPE, true);

        const save = (value: RelationshipKind): void => {
            cache.setRelationship(subType, superType, SUB_TYPE, false, value);
        };

        // skip recursive checking
        if (link === 'PENDING') {
            return []; // is 'true' the correct result here? 'true' will be stored in the type graph ...
        }

        // the result is already known
        if (link === 'LINK_EXISTS') {
            return [];
        }
        if (link === 'NO_LINK') {
            return [];
        }

        // do the expensive calculation now
        if (link === 'UNKNOWN') {
            // mark the current relationship as PENDING to detect and resolve cycling checks
            save('PENDING');

            // do the real logic
            const result = superType.kind.isSubType(superType, subType);

            // this allows to cache results (and to re-set the PENDING state)
            save(result ? 'LINK_EXISTS' : 'NO_LINK');
            return result;
        }
        assertUnreachable(link);
    }
}

const SUB_TYPE = 'isSubTypeOf';
