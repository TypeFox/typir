/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { isType, Type } from '../../graph/type-node.js';
import { TypeEqualityProblem } from '../../services/equality.js';
import { TypirSpecifics } from '../../typir.js';
import { TypirProblem } from '../../utils/utils-definitions.js';
import { checkValueForConflict, createKindConflict } from '../../utils/utils-type-comparison.js';
import { isPrimitiveKind, PrimitiveKind, PrimitiveTypeDetails } from './primitive-kind.js';

export class PrimitiveType extends Type {
    override readonly kind: PrimitiveKind<TypirSpecifics>;

    constructor(kind: PrimitiveKind<TypirSpecifics>, identifier: string, typeDetails: PrimitiveTypeDetails<TypirSpecifics>) {
        super(identifier, typeDetails);
        this.kind = kind;
        this.defineTheInitializationProcessOfThisType({}); // no preconditions
    }

    override getName(): string {
        return this.getIdentifier();
    }

    override getUserRepresentation(): string {
        return this.getIdentifier();
    }

    override analyzeTypeEqualityProblems(otherType: Type): TypirProblem[] {
        if (isPrimitiveType(otherType)) {
            return checkValueForConflict(this.getIdentifier(), otherType.getIdentifier(), 'name');
        } else {
            return [<TypeEqualityProblem>{
                $problem: TypeEqualityProblem,
                type1: this,
                type2: otherType,
                subProblems: [createKindConflict(otherType, this)],
            }];
        }
    }

    protected analyzeSubTypeProblems(subType: PrimitiveType, superType: PrimitiveType): TypirProblem[] {
        return subType.analyzeTypeEqualityProblems(superType);
    }

}

export function isPrimitiveType(type: unknown): type is PrimitiveType {
    return isType(type) && isPrimitiveKind(type.kind);
}
