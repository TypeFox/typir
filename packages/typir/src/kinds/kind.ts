// eslint-disable-next-line header/header
import { Type } from '../graph/type-graph';

/**
 * Typir provides a default set of Kinds, e.g. primitive types and class types.
 * For domain-specific kinds, implement this interface or create a new sub-class of an existing kind-class.
 */
export interface Kind {
    readonly $type: string;

    getUserRepresentation(type: Type): string;

    // assumption: both types habe the same kind and this kind owns the called function
    isAssignable(source: Type, target: Type): boolean;
    areTypesEqual(type1: Type, type2: Type): boolean;

    // TODO add more features
}

export function isKind(kind: unknown): kind is Kind {
    return typeof kind === 'object' && kind !== null && typeof (kind as Kind).$type === 'string';
}
