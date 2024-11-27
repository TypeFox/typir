/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
******************************************************************************/

import { TypeEqualityProblem } from '../../features/equality.js';
import { SubTypeProblem } from '../../features/subtype.js';
import { isType, Type } from '../../graph/type-node.js';
import { TypirProblem } from '../../utils/utils-definitions.js';
import { checkValueForConflict, createKindConflict } from '../../utils/utils-type-comparison.js';
import { MultiplicityKind, isMultiplicityKind } from './multiplicity-kind.js';

export class MultiplicityType extends Type {
    override readonly kind: MultiplicityKind;
    readonly constrainedType: Type;
    readonly lowerBound: number;
    readonly upperBound: number;

    constructor(kind: MultiplicityKind, identifier: string,
        constrainedType: Type, lowerBound: number, upperBound: number) {
        super(identifier);
        this.kind = kind;
        this.constrainedType = constrainedType;
        this.lowerBound = lowerBound;
        this.upperBound = upperBound;
        this.defineTheInitializationProcessOfThisType({}); // TODO preconditions
    }

    override getName(): string {
        return `${this.constrainedType.getName()}${this.kind.printRange(this.getLowerBound(), this.getUpperBound())}`;
    }

    override getUserRepresentation(): string {
        return this.getName();
    }

    override analyzeTypeEqualityProblems(otherType: Type): TypirProblem[] {
        if (isMultiplicityKind(otherType)) {
            const conflicts: TypirProblem[] = [];
            // check the multiplicities
            conflicts.push(...checkValueForConflict(this.getLowerBound(), this.getLowerBound(), 'lower bound'));
            conflicts.push(...checkValueForConflict(this.getUpperBound(), this.getUpperBound(), 'upper bound'));
            // check the constrained type
            const constrainedTypeConflict = this.kind.services.equality.getTypeEqualityProblem(this.getConstrainedType(), this.getConstrainedType());
            if (constrainedTypeConflict !== undefined) {
                conflicts.push(constrainedTypeConflict);
            }
            return conflicts;
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
        if (isMultiplicityType(superType)) {
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
        if (isMultiplicityType(subType)) {
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

    protected analyzeSubTypeProblems(subType: MultiplicityType, superType: MultiplicityType): TypirProblem[] {
        const conflicts: TypirProblem[] = [];
        // check the multiplicities
        conflicts.push(...checkValueForConflict(subType.getLowerBound(), superType.getLowerBound(), 'lower bound', this.kind.isBoundGreaterEquals));
        conflicts.push(...checkValueForConflict(subType.getUpperBound(), superType.getUpperBound(), 'upper bound', this.kind.isBoundGreaterEquals));
        // check the constrained type
        const constrainedTypeConflict = this.kind.services.subtype.getSubTypeProblem(subType.getConstrainedType(), superType.getConstrainedType());
        if (constrainedTypeConflict !== undefined) {
            conflicts.push(constrainedTypeConflict);
        }
        return conflicts;
    }

    getConstrainedType(): Type {
        return this.constrainedType;
    }

    getLowerBound(): number {
        return this.lowerBound;
    }

    getUpperBound(): number {
        return this.upperBound;
    }
}

export function isMultiplicityType(type: unknown): type is MultiplicityType {
    return isType(type) && isMultiplicityKind(type.kind);
}
