/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { TypeComparisonResult } from '../utils.js';

export interface TypeAssignability {
    isAssignable(source: Type, target: Type): TypeComparisonResult; // target := source;
}

export class DefaultTypeAssignability implements TypeAssignability {
    protected readonly typir: Typir;

    constructor(typir: Typir) {
        this.typir = typir;
    }

    isAssignable(source: Type, target: Type): TypeComparisonResult {
        // conversion possible?
        if (this.typir.conversion.isConvertibleTo(source, target, 'IMPLICIT')) {
            return [];
        }

        // allow the types kind to determine about sub-type relationships
        return this.typir.subtype.isSubType(target, source);
    }
}
