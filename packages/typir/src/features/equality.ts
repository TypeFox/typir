/* eslint-disable header/header */
import { Type } from '../graph/type-graph';
import { Typir } from '../typir';

export interface TypeEquality {
    areTypesEqual(type1: Type, type2: Type): boolean;
}

export class DefaultTypeEquality implements TypeEquality {
    protected readonly typir: Typir;

    constructor(typir: Typir) {
        this.typir = typir;
    }

    areTypesEqual(type1: Type, type2: Type): boolean {
        if (type1 === type2) {
            return true;
        }
        if (type1.kind !== type2.kind) {
            return false;
        }
        // equal types must have the same kind
        return type1.kind.areTypesEqual(type1, type2);
        // TODO handle recursion
    }
}
