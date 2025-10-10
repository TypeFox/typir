/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeGraphListener } from '../../graph/type-graph.js';
import { AnalyzeEqualityOptions, AnalyzeSubTypeOptions, isType, Type } from '../../graph/type-node.js';
import { TypeEqualityProblem } from '../../services/equality.js';
import { TypirSpecifics } from '../../typir.js';
import { TypirProblem } from '../../utils/utils-definitions.js';
import { createKindConflict } from '../../utils/utils-type-comparison.js';
import { isTopKind, TopKind, TopTypeDetails } from './top-kind.js';

export class TopType extends Type implements TypeGraphListener {
    override readonly kind: TopKind<TypirSpecifics>;

    constructor(kind: TopKind<TypirSpecifics>, identifier: string, typeDetails: TopTypeDetails<TypirSpecifics>) {
        super(identifier, typeDetails);
        this.kind = kind;
        this.defineTheInitializationProcessOfThisType({}); // no preconditions

        // ensure, that all (other) types are a sub-type of this Top type:
        const graph = kind.services.infrastructure.Graph;
        graph.addListener(this, { callOnAddedForAllExisting: true }); // all upcomping types
    }

    override dispose(): void {
        this.kind.services.infrastructure.Graph.removeListener(this);
    }

    onAddedType(type: Type, _key: string): void {
        if (type !== this) {
            this.kind.services.Subtype.markAsSubType(type, this, { checkForCycles: false });
        }
    }

    override getName(): string {
        return this.getIdentifier();
    }

    override getUserRepresentation(): string {
        return this.getIdentifier();
    }

    override analyzeTypeEquality(otherType: Type, _options?: AnalyzeEqualityOptions): boolean | TypirProblem[] {
        if (isTopType(otherType)) {
            return true;
        } else {
            return [<TypeEqualityProblem>{
                $problem: TypeEqualityProblem,
                type1: this,
                type2: otherType,
                subProblems: [createKindConflict(otherType, this)],
            }];
        }
    }

    override analyzeSubTypeProblems(otherSubType: Type, _options?: AnalyzeSubTypeOptions): boolean | TypirProblem[] {
        return isTopType(otherSubType) === false; // all types are sub-types of the top type (except the top type itself)
    }
    override analyzeSuperTypeProblems(_otherSuperType: Type, _options?: AnalyzeSubTypeOptions): boolean | TypirProblem[] {
        return false; // the top type has no super type
    }
    protected override analyzeSubSuperTypeProblems(_subType: Type, _superType: Type, _options?: AnalyzeSubTypeOptions): boolean | TypirProblem[] {
        throw new Error('this will never be called');
    }
}


export function isTopType(type: unknown): type is TopType {
    return isType(type) && isTopKind(type.kind);
}
