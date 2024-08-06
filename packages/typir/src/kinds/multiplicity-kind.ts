/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { SubTypeProblem } from '../features/subtype.js';
import { TypeEdge } from '../graph/type-edge.js';
import { Type } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { TypirProblem, checkValueForConflict } from '../utils/utils-type-comparison.js';
import { assertKind } from '../utils/utils.js';
import { Kind, isKind } from './kind.js';

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
    readonly typir: Typir;
    readonly options: MultiplicityKindOptions;

    constructor(typir: Typir, options?: Partial<MultiplicityKindOptions>) {
        this.$name = 'MultiplicityTypeKind';
        this.typir = typir;
        this.typir.registerKind(this);
        this.options = {
            // the default values:
            symbolForUnlimited: '*',
            // the actually overriden values:
            ...options
        };
    }

    createMultiplicityForType(typeDetails: {
        constrainedType: Type,
        lowerBound: number,
        upperBound: number
    }): Type {
        // check input
        if (!this.checkBounds(typeDetails.lowerBound, typeDetails.upperBound)) {
            throw new Error();
        }

        // create the type with multiplicities
        const name = this.printType(typeDetails.constrainedType, typeDetails.lowerBound, typeDetails.upperBound);
        const newType = new Type(this, name);
        this.typir.graph.addNode(newType);

        // link it to the constrained type
        const edge = new TypeEdge(newType, typeDetails.constrainedType, CONSTRAINED_TYPE);
        this.typir.graph.addEdge(edge);

        // set values (at the edge, not at the node!)
        edge.properties.set(MULTIPLICITY_LOWER, typeDetails.lowerBound);
        edge.properties.set(MULTIPLICITY_UPPER, typeDetails.upperBound);

        return newType;
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

    protected printType(constrainedType: Type, lowerBound: number, upperBound: number): string {
        return `${this.typir.printer.printType(constrainedType)}${this.printRange(lowerBound, upperBound)}`;
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

    getUserRepresentation(type: Type): string {
        assertKind(type.kind, isMultiplicityKind);
        return this.printType(type.kind.getConstrainedType(type), type.kind.getLowerBound(type), type.kind.getUpperBound(type));
    }

    analyzeSubTypeProblems(superType: Type, subType: Type): TypirProblem[] {
        if (isMultiplicityKind(superType.kind) && isMultiplicityKind(subType.kind)) {
            const conflicts: TypirProblem[] = [];
            // check the multiplicities
            conflicts.push(...checkValueForConflict(superType.kind.getLowerBound(superType), subType.kind.getLowerBound(subType), 'lower bound', this.isBoundGreaterEquals));
            conflicts.push(...checkValueForConflict(superType.kind.getUpperBound(superType), subType.kind.getUpperBound(subType), 'upper bound', this.isBoundGreaterEquals));
            // check the constrained type
            const constrainedTypeConflict = this.typir.subtype.getSubTypeProblem(superType.kind.getConstrainedType(superType), subType.kind.getConstrainedType(subType));
            if (constrainedTypeConflict !== undefined) {
                conflicts.push(constrainedTypeConflict);
            }
            return conflicts;
        }
        return [<SubTypeProblem>{
            superType,
            subType,
            subProblems: checkValueForConflict(superType.kind.$name, subType.kind.$name, 'kind'),
        }];
    }

    protected isBoundGreaterEquals(leftBound: number, rightBound: number): boolean {
        if (leftBound === MULTIPLICITY_UNLIMITED) {
            return true;
        }
        if (rightBound === MULTIPLICITY_UNLIMITED) {
            return false;
        }
        return leftBound >= rightBound;
    }

    analyzeTypeEqualityProblems(type1: Type, type2: Type): TypirProblem[] {
        if (isMultiplicityKind(type1.kind) && isMultiplicityKind(type2.kind)) {
            const conflicts: TypirProblem[] = [];
            // check the multiplicities
            conflicts.push(...checkValueForConflict(this.getLowerBound(type1), this.getLowerBound(type2), 'lower bound'));
            conflicts.push(...checkValueForConflict(this.getUpperBound(type1), this.getUpperBound(type2), 'upper bound'));
            // check the constrained type
            const constrainedTypeConflict = this.typir.equality.getTypeEqualityProblem(type1.kind.getConstrainedType(type1), type2.kind.getConstrainedType(type2));
            if (constrainedTypeConflict !== undefined) {
                conflicts.push(constrainedTypeConflict);
            }
            return conflicts;
        }
        throw new Error();
    }

    getConstrainedType(typeWithMultiplicity: Type): Type {
        assertKind(typeWithMultiplicity.kind, isMultiplicityKind);
        return typeWithMultiplicity.getOutgoingEdges(CONSTRAINED_TYPE)[0].to;
    }

    getLowerBound(typeWithMultiplicity: Type): number {
        assertKind(typeWithMultiplicity.kind, isMultiplicityKind);
        return typeWithMultiplicity.getOutgoingEdges(CONSTRAINED_TYPE)[0].properties.get(MULTIPLICITY_LOWER) as number;
    }
    getUpperBound(typeWithMultiplicity: Type): number {
        assertKind(typeWithMultiplicity.kind, isMultiplicityKind);
        return typeWithMultiplicity.getOutgoingEdges(CONSTRAINED_TYPE)[0].properties.get(MULTIPLICITY_UPPER) as number;
    }
}

const MULTIPLICITY_LOWER = 'lowerBound';
const MULTIPLICITY_UPPER = 'upperBound';
const CONSTRAINED_TYPE = 'isMultiplicityFor';

export function isMultiplicityKind(kind: unknown): kind is MultiplicityKind {
    return isKind(kind) && kind.$name === MultiplicityKindName;
}
