// eslint-disable-next-line header/header
import assert from 'assert';
import { Type, TypeEdge } from '../graph/type-graph';
import { Typir } from '../main';
import { Kind, isKind } from './kind';
import { compareTypes } from '../utils';

export interface FixedParameterKindOptions {
    relaxedChecking: boolean,
}

/**
 * Suitable for kinds like Collection<T>, List<T>, Array<T>, Map<K, V>, ..., i.e. types with a fixed number of arbitrary parameter types
 */
export class FixedParameterKind implements Kind {
    readonly $type: 'FixedParameterKind';
    readonly typir: Typir;
    readonly baseName: string;
    readonly options: FixedParameterKindOptions;
    readonly parameterNames: string[];

    constructor(typir: Typir, baseName: string, options: FixedParameterKindOptions, ...parameterNames: string[]) {
        this.typir = typir;
        this.typir.registerKind(this);
        this.baseName = baseName;
        this.options = options;
        this.parameterNames = parameterNames;

        // check input
        assert(this.parameterNames.length >= 1);
    }

    // the order of parameters matters!
    createFixedParameterType(...parameterTypes: Type[]): Type {
        // create the class type
        const typeWithParameters = new Type(this, this.baseName);
        this.typir.graph.addNode(typeWithParameters);

        // add the given types to the required fixed parameters
        assert(this.parameterNames.length === parameterTypes.length);
        for (let index = 0; index < this.parameterNames.length; index++) {
            const edge = new TypeEdge(typeWithParameters, parameterTypes[index], FIXED_PARAMETER_TYPE);
            this.typir.graph.addEdge(edge);
        }

        return typeWithParameters;
    }

    getUserRepresentation(type: Type): string {
        return `${this.baseName}<${this.getParameterTypes(type).map(p => p.getUserRepresentation()).join(', ')}>`;
    }

    isAssignable(source: Type, target: Type): boolean {
        if (isFixedParametersKind(source.kind) && isFixedParametersKind(target.kind) && source.kind.baseName === target.kind.baseName) {
            if (this.options.relaxedChecking) {
                // more relaxed checking of the parameter types
                return compareTypes(this.getParameterTypes(source), this.getParameterTypes(target),
                    (s, t) => this.typir.assignability.isAssignable(s, t));
            } else {
                // strict checking of the parameter types
                return compareTypes(source.kind.getParameterTypes(source), target.kind.getParameterTypes(target),
                    (s, t) => s === t);
            }
        }
        return false;
    }

    areTypesEqual(type1: Type, type2: Type): boolean {
        return isFixedParametersKind(type1.kind) && isFixedParametersKind(type2.kind)
            && type1.kind.baseName === type2.kind.baseName
            && compareTypes(this.getParameterTypes(type1), this.getParameterTypes(type2), (t1, t2) => this.typir.equality.areTypesEqual(t1, t2));
    }

    getParameterTypes(fixedParameterType: Type): Type[] {
        const result = fixedParameterType.getOutgoingEdges(FIXED_PARAMETER_TYPE).map(edge => edge.to);
        assert(result.length === this.parameterNames.length);
        return result;
    }
}

const FIXED_PARAMETER_TYPE = 'hasField';

export function isFixedParametersKind(kind: unknown): kind is FixedParameterKind {
    return isKind(kind) && kind.$type === 'FixedParameterKind';
}
