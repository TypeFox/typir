/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeEqualityProblem } from '../features/equality.js';
import { SubTypeProblem } from '../features/subtype.js';
import { isType, Type } from '../graph/type-node.js';
import { TypirServices } from '../typir.js';
import { TypirProblem } from '../utils/utils-definitions.js';
import { checkValueForConflict, createKindConflict } from '../utils/utils-type-comparison.js';
import { assertTrue } from '../utils/utils.js';
import { isKind, Kind } from './kind.js';

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
    }

    override getName(): string {
        return this.kind.printType(this.getConstrainedType(), this.getLowerBound(), this.getUpperBound());
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



export interface MultiplicityTypeDetails {
    constrainedType: Type,
    lowerBound: number,
    upperBound: number
}

export interface MultiplicityKindOptions {
    symbolForUnlimited: string;
}

export const MULTIPLICITY_UNLIMITED = -1;
export const MultiplicityKindName = 'MultiplicityTypeKind';

/**
 * Types of this kind constrain a type with lower bound and upper bound,
 * e.g. ConstrainedType[1..*] or ConstrainedType[2..4].
 */
export class MultiplicityKind implements Kind {
    readonly $name: 'MultiplicityTypeKind';
    readonly services: TypirServices;
    readonly options: MultiplicityKindOptions;

    constructor(services: TypirServices, options?: Partial<MultiplicityKindOptions>) {
        this.$name = MultiplicityKindName;
        this.services = services;
        this.services.kinds.register(this);
        this.options = {
            // the default values:
            symbolForUnlimited: '*',
            // the actually overriden values:
            ...options
        };
    }

    getMultiplicityType(typeDetails: MultiplicityTypeDetails): MultiplicityType | undefined {
        const key = this.calculateIdentifier(typeDetails);
        return this.services.graph.getType(key) as MultiplicityType;
    }

    getOrCreateMultiplicityType(typeDetails: MultiplicityTypeDetails): MultiplicityType {
        const typeWithMultiplicity = this.getMultiplicityType(typeDetails);
        if (typeWithMultiplicity) {
            this.registerInferenceRules(typeDetails, typeWithMultiplicity);
            return typeWithMultiplicity;
        }
        return this.createMultiplicityType(typeDetails);
    }

    createMultiplicityType(typeDetails: MultiplicityTypeDetails): MultiplicityType {
        // check input
        assertTrue(this.getMultiplicityType(typeDetails) === undefined);
        if (!this.checkBounds(typeDetails.lowerBound, typeDetails.upperBound)) {
            throw new Error();
        }

        // create the type with multiplicities
        const typeWithMultiplicity = new MultiplicityType(this, this.calculateIdentifier(typeDetails), typeDetails.constrainedType, typeDetails.lowerBound, typeDetails.upperBound);
        this.services.graph.addNode(typeWithMultiplicity);

        this.registerInferenceRules(typeDetails, typeWithMultiplicity);

        return typeWithMultiplicity;
    }

    protected registerInferenceRules(_typeDetails: MultiplicityTypeDetails, _typeWithMultiplicity: MultiplicityType): void {
        // TODO
    }

    calculateIdentifier(typeDetails: MultiplicityTypeDetails): string {
        return this.printType(typeDetails.constrainedType, typeDetails.lowerBound, typeDetails.upperBound);
    }

    protected checkBounds(lowerBound: number, upperBound: number): boolean {
        // check range
        if (lowerBound < 0 || upperBound < -1) {
            return false;
        }
        // upper bound must not be lower than the lower bound
        if (0 <= lowerBound && 0 <= upperBound && lowerBound > upperBound) {
            return false;
        }
        return true;
    }

    printType(constrainedType: Type, lowerBound: number, upperBound: number): string {
        return `${constrainedType.getName()}${this.printRange(lowerBound, upperBound)}`;
    }
    protected printRange(lowerBound: number, upperBound: number): string {
        if (lowerBound === upperBound || (lowerBound === 0 && upperBound === MULTIPLICITY_UNLIMITED)) {
            // [2..2] => [2], [0..*] => [*]
            return `[${this.printBound(upperBound)}]`;
        } else {
            // e.g. [1..3], [1..*]
            return `[${this.printBound(lowerBound)}..${this.printBound(upperBound)}]`;
        }
    }
    protected printBound(bound: number): string {
        return bound === MULTIPLICITY_UNLIMITED ? this.options.symbolForUnlimited : `${bound}`;
    }

    isBoundGreaterEquals(leftBound: number, rightBound: number): boolean {
        if (leftBound === MULTIPLICITY_UNLIMITED) {
            return true;
        }
        if (rightBound === MULTIPLICITY_UNLIMITED) {
            return false;
        }
        return leftBound >= rightBound;
    }

}

export function isMultiplicityKind(kind: unknown): kind is MultiplicityKind {
    return isKind(kind) && kind.$name === MultiplicityKindName;
}
