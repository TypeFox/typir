/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { isType, Type } from '../../graph/type-node.js';
import { TypeEqualityProblem } from '../../services/equality.js';
import { TypirSpecifics } from '../../typir.js';
import { TypirProblem } from '../../utils/utils-definitions.js';
import { checkTypeArrays, checkValueForConflict, createKindConflict, createTypeCheckStrategy } from '../../utils/utils-type-comparison.js';
import { assertTrue, toArray } from '../../utils/utils.js';
import { FixedParameterKind, FixedParameterTypeDetails, isFixedParametersKind, Parameter } from './fixed-parameters-kind.js';

export class ParameterValue {
    readonly parameter: Parameter;
    readonly type: Type;

    constructor(parameter: Parameter, type: Type) {
        this.parameter = parameter;
        this.type = type;
    }
}

export class FixedParameterType extends Type {
    override readonly kind: FixedParameterKind<TypirSpecifics>;
    readonly parameterValues: ParameterValue[] = [];

    constructor(kind: FixedParameterKind<TypirSpecifics>, identifier: string, typeDetails: FixedParameterTypeDetails<TypirSpecifics>) {
        super(identifier, typeDetails);
        this.kind = kind;

        // set the parameter values
        const typeValues = toArray(typeDetails.parameterTypes);
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

    protected analyzeTypeEqualityProblems(otherType: Type): TypirProblem[] {
        if (isFixedParameterType(otherType)) {
            // same name, e.g. both need to be Map, Set, Array, ...
            const baseTypeCheck = checkValueForConflict(this.kind.baseName, otherType.kind.baseName, 'base type');
            if (baseTypeCheck.length >= 1) {
                // e.g. List<String> !== Set<String>
                return baseTypeCheck;
            } else {
                // all parameter types must match, e.g. Set<String> !== Set<Boolean>
                const conflicts: TypirProblem[] = [];
                conflicts.push(...checkTypeArrays(this.getParameterTypes(), otherType.getParameterTypes(), (t1, t2) => this.kind.services.Equality.getTypeEqualityProblem(t1, t2), false));
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
