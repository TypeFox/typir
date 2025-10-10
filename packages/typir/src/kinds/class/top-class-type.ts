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
import { isClassType } from './class-type.js';
import { isTopClassKind, TopClassKind, TopClassTypeDetails } from './top-class-kind.js';

export class TopClassType extends Type implements TypeGraphListener {
    override readonly kind: TopClassKind<TypirSpecifics>;

    constructor(kind: TopClassKind<TypirSpecifics>, identifier: string, typeDetails: TopClassTypeDetails<TypirSpecifics>) {
        super(identifier, typeDetails);
        this.kind = kind;
        this.defineTheInitializationProcessOfThisType({}); // no preconditions

        // ensure, that all (other) Class types are a sub-type of this TopClass type:
        const graph = kind.services.infrastructure.Graph;
        graph.addListener(this, { callOnAddedForAllExisting: true });
    }

    override dispose(): void {
        this.kind.services.infrastructure.Graph.removeListener(this);
    }

    onAddedType(type: Type, _key: string): void {
        if (type !== this && isClassType(type)) {
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
        if (isTopClassType(otherType)) {
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
        return isClassType(otherSubType); // all class types are sub-types of the top-class-type
    }
    override analyzeSuperTypeProblems(otherSuperType: Type, _options?: AnalyzeSubTypeOptions): boolean | TypirProblem[] {
        return isTopClassType(otherSuperType) === false; // the top-class-type is no super-type of itself
    }
    protected override analyzeSubSuperTypeProblems(_subType: Type, _superType: Type, _options?: AnalyzeSubTypeOptions): boolean | TypirProblem[] {
        throw new Error('this will never be called');
    }
}


export function isTopClassType(type: unknown): type is TopClassType {
    return isType(type) && isTopClassKind(type.kind);
}
