/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type } from '../../graph/type-node.js';
import { TypirServices } from '../../typir.js';
import { assertTrue } from '../../utils/utils.js';
import { Kind, isKind } from '../kind.js';
import { MultiplicityType } from './multiplicity-type.js';

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
    readonly options: Readonly<MultiplicityKindOptions>;

    constructor(services: TypirServices, options?: Partial<MultiplicityKindOptions>) {
        this.$name = MultiplicityKindName;
        this.services = services;
        this.services.infrastructure.Kinds.register(this);
        this.options = {
            // the default values:
            symbolForUnlimited: '*',
            // the actually overriden values:
            ...options
        };
    }

    getMultiplicityType(typeDetails: MultiplicityTypeDetails): MultiplicityType | undefined {
        const key = this.calculateIdentifier(typeDetails);
        return this.services.infrastructure.Graph.getType(key) as MultiplicityType;
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
        this.services.infrastructure.Graph.addNode(typeWithMultiplicity);

        this.registerInferenceRules(typeDetails, typeWithMultiplicity);

        return typeWithMultiplicity;
    }

    protected registerInferenceRules(_typeDetails: MultiplicityTypeDetails, _typeWithMultiplicity: MultiplicityType): void {
        // TODO
    }

    calculateIdentifier(typeDetails: MultiplicityTypeDetails): string {
        return `${typeDetails.constrainedType.getIdentifier()}${this.printRange(typeDetails.lowerBound, typeDetails.upperBound)}`;
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

    printRange(lowerBound: number, upperBound: number): string {
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
