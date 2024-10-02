/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { SubTypeProblem } from '../features/subtype.js';
import { TypeEdge } from '../graph/type-edge.js';
import { Type } from '../graph/type-node.js';
import { TypirServices } from '../typir.js';
import { TypirProblem } from '../utils/utils-definitions.js';
import { TypeCheckStrategy, checkTypes, checkValueForConflict, createTypeCheckStrategy } from '../utils/utils-type-comparison.js';
import { assertKind, assertTrue, toArray } from '../utils/utils.js';
import { Kind, isKind } from './kind.js';

export interface FixedParameterKindOptions {
    subtypeParameterChecking: TypeCheckStrategy,
}

export const FixedParameterKindName = 'FixedParameterKind';

/**
 * Suitable for kinds like Collection<T>, List<T>, Array<T>, Map<K, V>, ..., i.e. types with a fixed number of arbitrary parameter types
 */
export class FixedParameterKind implements Kind {
    readonly $name: `FixedParameterKind-${string}`;
    readonly baseName: string;
    readonly options: FixedParameterKindOptions;
    readonly parameterNames: string[];
    readonly services: TypirServices;

    constructor(services: TypirServices, baseName: string, options?: Partial<FixedParameterKindOptions>, ...parameterNames: string[]) {
        this.$name = `FixedParameterKind-${baseName}`;
        this.services = services;
        this.services.kinds.register(this);
        this.baseName = baseName;
        this.options = {
            // the default values:
            subtypeParameterChecking: 'EQUAL_TYPE',
            // the actually overriden values:
            ...options
        };
        this.parameterNames = parameterNames;

        // check input
        assertTrue(this.parameterNames.length >= 1);
    }

    // the order of parameters matters!
    createFixedParameterType(typeDetails: {
        parameterTypes: Type | Type[]
    }): Type {
        const theParameterTypes = toArray(typeDetails.parameterTypes);

        // create the class type
        const typeWithParameters = new Type(this, this.printSignature(this.baseName, theParameterTypes)); // use the signature for a unique name
        this.services.graph.addNode(typeWithParameters);

        // add the given types to the required fixed parameters
        assertTrue(this.parameterNames.length === theParameterTypes.length);
        for (let index = 0; index < this.parameterNames.length; index++) {
            const edge = new TypeEdge(typeWithParameters, theParameterTypes[index], FIXED_PARAMETER_TYPE);
            this.services.graph.addEdge(edge);
        }

        return typeWithParameters;
    }

    getUserRepresentation(type: Type): string {
        assertKind(type.kind, isFixedParametersKind);
        return this.printSignature(this.baseName, this.getParameterTypes(type));
    }
    protected printSignature(baseName: string, parameterTypes: Type[]): string {
        return `${baseName}<${parameterTypes.map(p => this.services.printer.printType(p)).join(', ')}>`;
    }

    analyzeSubTypeProblems(subType: Type, superType: Type): TypirProblem[] {
        // same name, e.g. both need to be Map, Set, Array, ...
        if (isFixedParametersKind(superType.kind) && isFixedParametersKind(subType.kind) && superType.kind.baseName === subType.kind.baseName) {
            // all parameter types must match
            const checkStrategy = createTypeCheckStrategy(this.options.subtypeParameterChecking, this.services);
            return checkTypes(subType.kind.getParameterTypes(subType), superType.kind.getParameterTypes(superType), checkStrategy);
        }
        return [<SubTypeProblem>{
            superType,
            subType,
            subProblems: checkValueForConflict(superType.kind.$name, subType.kind.$name, 'kind'),
        }];
    }

    analyzeTypeEqualityProblems(type1: Type, type2: Type): TypirProblem[] {
        if (isFixedParametersKind(type1.kind) && isFixedParametersKind(type2.kind) && type1.kind.baseName === type2.kind.baseName) {
            const conflicts: TypirProblem[] = [];
            conflicts.push(...checkTypes(type1.kind.getParameterTypes(type1), type2.kind.getParameterTypes(type2), (t1, t2) => this.services.equality.getTypeEqualityProblem(t1, t2)));
            return conflicts;
        }
        throw new Error();
    }

    getParameterTypes(fixedParameterType: Type): Type[] {
        assertKind(fixedParameterType.kind, isFixedParametersKind);
        const result = fixedParameterType.getOutgoingEdges(FIXED_PARAMETER_TYPE).map(edge => edge.to);
        assertTrue(result.length === this.parameterNames.length);
        return result;
    }
}

const FIXED_PARAMETER_TYPE = 'hasField';

export function isFixedParametersKind(kind: unknown): kind is FixedParameterKind {
    return isKind(kind) && kind.$name.startsWith('FixedParameterKind-');
}
