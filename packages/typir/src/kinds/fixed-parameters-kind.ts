// eslint-disable-next-line header/header
import assert from 'assert';
import { Type, TypeEdge } from '../graph/type-graph';
import { Typir } from '../main';
import { Kind, isKind } from './kind';

/**
 * Suitable for kinds like Collection<T>, List<T>, Array<T>, Map<K, V>, ..., i.e. types with a fixed number of arbitrary parameter types
 */
export class FixedParameterKind extends Kind {
    readonly $type: 'FixedParameterKind';
    readonly baseName: string;
    readonly relaxedChecking: boolean;
    readonly parameterNames: string[];

    constructor(typir: Typir, baseName: string, relaxedChecking: boolean, ...parameterNames: string[]) {
        super(typir);
        this.baseName = baseName;
        this.relaxedChecking = relaxedChecking;
        this.parameterNames = parameterNames;

        // check input
        assert(this.parameterNames.length >= 1);
    }

    // the order of parameters matters!
    createFixedParameterType(...parameterTypes: Type[]): Type {
        // create the class type
        const typeWithParameters = new Type(this, this.baseName); // TODO unique type names?? => design decision!
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
            if (this.relaxedChecking) {
                // more relaxed checking of the parameter types
                return this.checkParameters(source.kind.getParameterTypes(source), target.kind.getParameterTypes(target),
                    (s, t) => this.typir.assignability.isAssignable(s, t));
            } else {
                // strict checking of the parameter types
                return this.checkParameters(source.kind.getParameterTypes(source), target.kind.getParameterTypes(target),
                    (s, t) => s === t);
            }
        }
        return false;
    }

    protected checkParameters(left: Type[], right: Type[], checker: (l: Type, r: Type) => boolean): boolean {
        if (left.length !== right.length) {
            return false;
        }
        for (let i = 0; i < left.length; i++) {
            if (checker(left[i], right[i]) === false) {
                return false;
            }
        }
        return true;
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
