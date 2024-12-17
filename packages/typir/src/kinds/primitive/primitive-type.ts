/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeEqualityProblem } from '../../services/equality.js';
import { SubTypeProblem } from '../../services/subtype.js';
import { isType, Type } from '../../graph/type-node.js';
import { TypirProblem } from '../../utils/utils-definitions.js';
import { checkValueForConflict, createKindConflict } from '../../utils/utils-type-comparison.js';
import { PrimitiveKind, PrimitiveTypeDetails, isPrimitiveKind } from './primitive-kind.js';

export class PrimitiveType extends Type {
    override readonly kind: PrimitiveKind;

    constructor(kind: PrimitiveKind, identifier: string, typeDetails: PrimitiveTypeDetails) {
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

    override analyzeIsSubTypeOf(superType: Type): TypirProblem[] {
        if (isPrimitiveType(superType)) {
            return this.analyzeSubTypeProblems(this, superType);
        } else {
            return [<SubTypeProblem>{
                $problem: SubTypeProblem,
                superType,
                subType: this,
                subProblems: [createKindConflict(this, superType)],
            }];
        }
    }

    override analyzeIsSuperTypeOf(subType: Type): TypirProblem[] {
        if (isPrimitiveType(subType)) {
            return this.analyzeSubTypeProblems(subType, this);
        } else {
            return [<SubTypeProblem>{
                $problem: SubTypeProblem,
                superType: this,
                subType,
                subProblems: [createKindConflict(subType, this)],
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
