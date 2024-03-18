/* eslint-disable header/header */
import { Type } from '../graph/type-graph';
import { Typir } from '../main';

export interface SubType {
    isSubType(superType: Type, subType: Type): boolean;
}

export class DefaultSubType implements SubType {
    protected readonly typir: Typir;

    constructor(typir: Typir) {
        this.typir = typir;
    }

    isSubType(superType: Type, subType: Type): boolean {
        if (superType.kind.$name === subType.kind.$name) {
            // TODO prevent loops due to recursion, cache results
            // TODO lazy? persistence? MemoizingService?!
            return superType.kind.isSubType(superType, subType);
        }
        return false;
    }
}
