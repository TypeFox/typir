/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeEqualityProblem } from '../../services/equality.js';
import { SubTypeProblem } from '../../services/subtype.js';
import { isType, Type } from '../../graph/type-node.js';
import { TypirProblem } from '../../utils/utils-definitions.js';
import { checkValueForConflict, checkTypeArrays, createKindConflict, createTypeCheckStrategy } from '../../utils/utils-type-comparison.js';
import { assertTrue } from '../../utils/utils.js';
import { Parameter, FixedParameterKind, isFixedParametersKind } from './fixed-parameters-kind.js';

export class ParameterValue {
    readonly parameter: Parameter;
    readonly type: Type;

    constructor(parameter: Parameter, type: Type) {
        this.parameter = parameter;
        this.type = type;
    }
}

export class FixedParameterType extends Type {
    override readonly kind: FixedParameterKind;
    readonly parameterValues: ParameterValue[] = [];

    constructor(kind: FixedParameterKind, identifier: string, ...typeValues: Type[]) {
        super(identifier);
        this.kind = kind;

        // set the parameter values
        assertTrue(kind.parameters.length === typeValues.length);
        for (let i = 0; i < typeValues.length; i++) {
            this.parameterValues.push({
                parameter: kind.parameters[i],
                type: typeValues[i],
            });
        }
        this.defineTheInitializationProcessOfThisType({}); // TODO preconditions
    }

    getParameterTypes(): Type[] {
        return this.parameterValues.map(p => p.type);
    }

    override getName(): string {
        return `${this.kind.printSignature(this.kind.baseName, this.getParameterTypes(), ', ')}`;
    }

    override getUserRepresentation(): string {
        return this.getName();
    }

    override analyzeTypeEqualityProblems(otherType: Type): TypirProblem[] {
        if (isFixedParameterType(otherType)) {
            // same name, e.g. both need to be Map, Set, Array, ...
            const baseTypeCheck = checkValueForConflict(this.kind.baseName, otherType.kind.baseName, 'base type');
            if (baseTypeCheck.length >= 1) {
                // e.g. List<String> !== Set<String>
                return baseTypeCheck;
            } else {
                // all parameter types must match, e.g. Set<String> !== Set<Boolean>
                const conflicts: TypirProblem[] = [];
                conflicts.push(...checkTypeArrays(this.getParameterTypes(), otherType.getParameterTypes(), (t1, t2) => this.kind.services.equality.getTypeEqualityProblem(t1, t2), false));
                return conflicts;
            }
        } else {
            return [<TypeEqualityProblem>{
                $problem: TypeEqualityProblem,
                type1: this,
                type2: otherType,
                subProblems: [createKindConflict(this, otherType)],
            }];
        }
    }

    override analyzeIsSubTypeOf(superType: Type): TypirProblem[] {
        if (isFixedParameterType(superType)) {
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
        if (isFixedParameterType(subType)) {
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

    protected analyzeSubTypeProblems(subType: FixedParameterType, superType: FixedParameterType): TypirProblem[] {
        // same name, e.g. both need to be Map, Set, Array, ...
        const baseTypeCheck = checkValueForConflict(subType.kind.baseName, superType.kind.baseName, 'base type');
        if (baseTypeCheck.length >= 1) {
            // e.g. List<String> !== Set<String>
            return baseTypeCheck;
        } else {
            // all parameter types must match, e.g. Set<String> !== Set<Boolean>
            const checkStrategy = createTypeCheckStrategy(this.kind.options.parameterSubtypeCheckingStrategy, this.kind.services);
            return checkTypeArrays(subType.getParameterTypes(), superType.getParameterTypes(), checkStrategy, false);
        }
    }
}

export function isFixedParameterType(type: unknown): type is FixedParameterType {
    return isType(type) && isFixedParametersKind(type.kind);
}
