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
            return this.createSubTypeConflict(superType, subType, []); // TODO cache previous subConflicts?! how to store additional properties? that is not supported by the caching service!
        }

        // do the expensive calculation now
        if (link === 'UNKNOWN') {
            // mark the current relationship as PENDING to detect and resolve cycling checks
            save('PENDING');

            // do the real logic
            const result = this.calculateSubType(superType, subType);

            // this allows to cache results (and to re-set the PENDING state)
            save(result ? 'LINK_EXISTS' : 'NO_LINK');
            return result;
        }
        assertUnreachable(link);
    }

    protected calculateSubType(superType: Type, subType: Type): TypeConflict[] {
        const conflicts: TypeConflict[] = [];
        if (superType.kind.$name !== subType.kind.$name) {
            // sub-types need to have the same kind: this is the precondition
            conflicts.push(createConflict(superType.kind.$name, subType.kind.$name, 'kind', 'SUB_TYPE'));
        } else {
            // compare the types: delegated to the kind
            conflicts.push(...superType.kind.isSubType(superType, subType));
        }

        // create the result
        if (conflicts.length >= 1) {
            return this.createSubTypeConflict(superType, subType, conflicts);
        } else {
            return conflicts;
        }
    }

    protected createSubTypeConflict(superType: Type, subType: Type, subConflicts: TypeConflict[]): TypeConflict[] {
        return [{
            expected: superType,
            actual: subType,
            location: 'the sub-type relationship',
            action: 'SUB_TYPE',
            subConflicts,
        }];
    }
}

const SUB_TYPE = 'isSubTypeOf';
