/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeEqualityProblem } from '../../services/equality.js';
import { SubTypeProblem, SubTypeResult } from '../../services/subtype.js';
import { isType, Type } from '../../graph/type-node.js';
import { TypirProblem } from '../../utils/utils-definitions.js';
import { createKindConflict } from '../../utils/utils-type-comparison.js';
import { TopKind, TopTypeDetails, isTopKind } from './top-kind.js';
import { TypeGraphListener } from '../../graph/type-graph.js';
import { TypeEdge } from '../../graph/type-edge.js';

export class TopType extends Type implements TypeGraphListener {
    override readonly kind: TopKind;

    constructor(kind: TopKind, identifier: string, typeDetails: TopTypeDetails) {
        super(identifier, typeDetails);
        this.kind = kind;
        this.defineTheInitializationProcessOfThisType({}); // no preconditions

        // ensure, that all (other) types are a sub-type of this Top type:
        const graph = kind.services.infrastructure.Graph;
        graph.getAllRegisteredTypes().forEach(t => this.markAsSubType(t)); // the already existing types
        graph.addListener(this); // all upcomping types
    }

    override dispose(): void {
        this.kind.services.infrastructure.Graph.removeListener(this);
    }

    protected markAsSubType(type: Type): void {
        if (type !== this) {
            this.kind.services.Subtype.markAsSubType(type, this, { checkForCycles: false });
        }
    }

    addedType(type: Type, _key: string): void {
        this.markAsSubType(type);
    }
    removedType(_type: Type, _key: string): void {
        // empty
    }
    addedEdge(_edge: TypeEdge): void {
        // empty
    }
    removedEdge(_edge: TypeEdge): void {
        // empty
    }

    override getName(): string {
        return this.getIdentifier();
    }

    override getUserRepresentation(): string {
        return this.getIdentifier();
    }

    override analyzeTypeEqualityProblems(otherType: Type): TypirProblem[] {
        if (isTopType(otherType)) {
            return [];
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
        if (isTopType(superType)) {
            // special case by definition: TopType is sub-type of TopType
            return [];
        } else {
            return [<SubTypeProblem>{
                $problem: SubTypeProblem,
                $result: SubTypeResult,
                superType,
                subType: this,
                result: false,
                subProblems: [createKindConflict(superType, this)],
            }];
        }
    }

    override analyzeIsSuperTypeOf(_subType: Type): TypirProblem[] {
        // a TopType is the super type of all types!
        return [];
    }

}

export function isTopType(type: unknown): type is TopType {
    return isType(type) && isTopKind(type.kind);
}
