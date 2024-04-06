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

export interface TypeEquality {
    areTypesEqual(type1: Type, type2: Type): TypeConflict[];
}

export class DefaultTypeEquality implements TypeEquality {
    protected readonly typir: Typir;

    constructor(typir: Typir) {
        this.typir = typir;
    }

    areTypesEqual(type1: Type, type2: Type): TypeConflict[] {
        const cache: TypeRelationshipCaching = this.typir.caching;
        const link = cache.getRelationship(type1, type2, EQUAL_TYPE, false);

        const save = (value: RelationshipKind): void => {
            cache.setRelationship(type1, type2, EQUAL_TYPE, false, value);
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
            return this.createEqualityConflict(type1, type2, []); // TODO cache previous subConflicts?!
        }

        // do the expensive calculation now
        if (link === 'UNKNOWN') {
            // mark the current relationship as PENDING to detect and resolve cycling checks
            save('PENDING');

            // do the real logic
            const result = this.calculateEquality(type1, type2);

            // this allows to cache results (and to re-set the PENDING state)
            save(result ? 'LINK_EXISTS' : 'NO_LINK');
            return result;
        }
        assertUnreachable(link);
    }

    protected calculateEquality(type1: Type, type2: Type): TypeConflict[] {
        if (type1 === type2) {
            return [];
        }
        if (type1.name === type2.name) {
            return [];
        }

        const conflicts: TypeConflict[] = [];
        if (type1.kind.$name !== type2.kind.$name) {
            // equal types must have the same kind
            conflicts.push(createConflict(type1.kind.$name, type2.kind.$name, 'kind', 'EQUAL_TYPE'));
        } else {
            // compare the types: delegated to the kind
            conflicts.push(...type1.kind.areTypesEqual(type1, type2));
        }

        // create the result
        if (conflicts.length >= 1) {
            return this.createEqualityConflict(type1, type2, conflicts);
        } else {
            return conflicts;
        }
    }

    protected createEqualityConflict(type1: Type, type2: Type, subConflicts: TypeConflict[]): TypeConflict[] {
        return [{
            expected: type1,
            actual: type2,
            location: 'the equality relationship',
            action: 'EQUAL_TYPE',
            subConflicts,
        }];
    }
}

const EQUAL_TYPE = 'areEqual';
