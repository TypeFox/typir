/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeEdge } from '../graph/type-edge.js';
import { Type } from '../graph/type-node.js';
import { Typir } from '../typir.js';
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

    constructor(typir: Typir, options: MultiplicityKindOptions) {
        this.$name = 'MultiplicityTypeKind';
        this.typir = typir;
        this.typir.registerKind(this);
        this.options = options;
    }

    createMultiplicityForType(constrainedType: Type, lowerBound: number, upperBound: number): Type {
        // check input
        if (!this.checkBounds(lowerBound, upperBound)) {
            throw new Error();
        }

        // create the type with multiplicities
        const name = this.printType(constrainedType, lowerBound, upperBound);
        const newType = new Type(this, name);
        this.typir.graph.addNode(newType);

        // link it to the constrained type
        const edge = new TypeEdge(newType, constrainedType, CONSTRAINED_TYPE);
        this.typir.graph.addEdge(edge);

        // set values (at the edge, not at the node!)
        edge.properties.set(MULTIPLICITY_LOWER, lowerBound);
        edge.properties.set(MULTIPLICITY_UPPER, upperBound);

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
        return `${constrainedType.getUserRepresentation()}${this.printRange(lowerBound, upperBound)}`;
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
        return this.printType(this.getConstrainedType(type), this.getLowerBound(type), this.getUpperBound(type));
    }

    isSubType(superType: Type, subType: Type): boolean {
        if (isMultiplicityKind(superType.kind) && isMultiplicityKind(subType.kind)) {
            return this.isBoundGreaterEquals(this.getLowerBound(superType), this.getLowerBound(subType)) &&
                this.isBoundGreaterEquals(this.getUpperBound(superType), this.getUpperBound(subType)) &&
                this.typir.subtype.isSubType(this.getConstrainedType(superType), this.getConstrainedType(subType));
        }
        return false;
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

    areTypesEqual(type1: Type, type2: Type): boolean {
        if (isMultiplicityKind(type1.kind) && isMultiplicityKind(type2.kind)) {
            return this.getLowerBound(type1) === this.getLowerBound(type2) &&
                this.getUpperBound(type1) === this.getUpperBound(type2) &&
                this.typir.equality.areTypesEqual(this.getConstrainedType(type1), this.getConstrainedType(type2));
        }
        return false;
    }

    getConstrainedType(typeWithMultiplicity: Type): Type {
        return typeWithMultiplicity.getOutgoingEdges(CONSTRAINED_TYPE)[0].to;
    }

    getLowerBound(typeWithMultiplicity: Type): number {
        return typeWithMultiplicity.getOutgoingEdges(CONSTRAINED_TYPE)[0].properties.get(MULTIPLICITY_LOWER) as number;
    }
    getUpperBound(typeWithMultiplicity: Type): number {
        return typeWithMultiplicity.getOutgoingEdges(CONSTRAINED_TYPE)[0].properties.get(MULTIPLICITY_UPPER) as number;
    }
}

const MULTIPLICITY_LOWER = 'lowerBound';
const MULTIPLICITY_UPPER = 'upperBound';
const CONSTRAINED_TYPE = 'isMultiplicityFor';

export function isMultiplicityKind(kind: unknown): kind is MultiplicityKind {
    return isKind(kind) && kind.$name === MultiplicityKindName;
}
