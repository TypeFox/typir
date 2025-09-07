/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
******************************************************************************/

import { isType, Type } from '../../graph/type-node.js';
import { TypeEqualityProblem } from '../../services/equality.js';
import { isSubTypeProblem } from '../../services/subtype.js';
import { TypirSpecifics } from '../../typir.js';
import { TypirProblem } from '../../utils/utils-definitions.js';
import { checkValueForConflict, createKindConflict } from '../../utils/utils-type-comparison.js';
import { isMultiplicityKind, MultiplicityKind, MultiplicityTypeDetails } from './multiplicity-kind.js';

export class MultiplicityType extends Type {
    override readonly kind: MultiplicityKind<TypirSpecifics>;
    readonly constrainedType: Type;
    readonly lowerBound: number;
    readonly upperBound: number;

    constructor(kind: MultiplicityKind<TypirSpecifics>, identifier: string, typeDetails: MultiplicityTypeDetails<TypirSpecifics>) {
        super(identifier, typeDetails);
        this.kind = kind;
        this.constrainedType = typeDetails.constrainedType;
        this.lowerBound = typeDetails.lowerBound;
        this.upperBound = typeDetails.upperBound;
        this.defineTheInitializationProcessOfThisType({}); // TODO preconditions
    }

    override getName(): string {
        return `${this.constrainedType.getName()}${this.kind.printRange(this.getLowerBound(), this.getUpperBound())}`;
    }

    override getUserRepresentation(): string {
        return this.getName();
    }

    override analyzeTypeEquality(otherType: Type, failFast: boolean): boolean | TypirProblem[] {
        if (isMultiplicityKind(otherType)) {
            const conflicts: TypirProblem[] = [];
            // check the multiplicities
            conflicts.push(...checkValueForConflict(this.getLowerBound(), this.getLowerBound(), 'lower bound'));
            conflicts.push(...checkValueForConflict(this.getUpperBound(), this.getUpperBound(), 'upper bound'));
            if (conflicts.length >= 1 && failFast) { return conflicts; }
            // check the constrained type
            const constrainedTypeConflict = this.kind.services.Equality.getTypeEqualityProblem(this.getConstrainedType(), this.getConstrainedType());
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

    protected analyzeSubTypeProblems(subType: MultiplicityType, superType: MultiplicityType): TypirProblem[] {
        const conflicts: TypirProblem[] = [];
        // check the multiplicities
        conflicts.push(...checkValueForConflict(subType.getLowerBound(), superType.getLowerBound(), 'lower bound', this.kind.isBoundGreaterEquals));
        conflicts.push(...checkValueForConflict(subType.getUpperBound(), superType.getUpperBound(), 'upper bound', this.kind.isBoundGreaterEquals));
        // check the constrained type
        const constrainedTypeConflict = this.kind.services.Subtype.getSubTypeResult(subType.getConstrainedType(), superType.getConstrainedType());
        if (isSubTypeProblem(constrainedTypeConflict)) {
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
