/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeGraphListener } from '../../graph/type-graph.js';
import { isType, Type } from '../../graph/type-node.js';
import { TypeEqualityProblem } from '../../services/equality.js';
import { TypirProblem } from '../../utils/utils-definitions.js';
import { createKindConflict } from '../../utils/utils-type-comparison.js';
import { BottomKind, BottomTypeDetails, isBottomKind } from './bottom-kind.js';

export class BottomType extends Type implements TypeGraphListener {
    override readonly kind: BottomKind<unknown>;

    constructor(kind: BottomKind<unknown>, identifier: string, typeDetails: BottomTypeDetails<unknown>) {
        super(identifier, typeDetails);
        this.kind = kind;
        this.defineTheInitializationProcessOfThisType({}); // no preconditions

        // ensure, that this Bottom type is a sub-type of all (other) types:
        const graph = kind.services.infrastructure.Graph;
        graph.addListener(this, { callOnAddedForAllExisting: true });
    }

    override dispose(): void {
        this.kind.services.infrastructure.Graph.removeListener(this);
    }

    onAddedType(type: Type, _key: string): void {
        // this method is called for the already existing types and for all upcomping types
        if (type !== this) {
            this.kind.services.Subtype.markAsSubType(this, type, { checkForCycles: false });
        }
    }

    override getName(): string {
        return this.getIdentifier();
    }

    override getUserRepresentation(): string {
        return this.getIdentifier();
    }

    override analyzeTypeEqualityProblems(otherType: Type): TypirProblem[] {
        if (isBottomType(otherType)) {
            return [];
        } else {
            return [<TypeEqualityProblem>{
                $problem: TypeEqualityProblem,
                type1: this,
                type2: otherType,
                subProblems: [createKindConflict(this, otherType)],
            }];
        }
    }

}

export function isBottomType(type: unknown): type is BottomType {
    return isType(type) && isBottomKind(type.kind);
}
