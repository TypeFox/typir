// eslint-disable-next-line header/header
import { Type } from '../graph/type-graph';
import { Typir } from '../main';

export interface TypeAssignability {
    isAssignable(source: Type, target: Type): boolean;
}

export class DefaultTypeAssignability implements TypeAssignability {
    protected readonly typir: Typir;

    constructor(typir: Typir) {
        this.typir = typir;
    }

    isAssignable(source: Type, target: Type): boolean {
        // same types?
        if (source === target) {
            return true;
        }

        // explicit conversion possible?
        if (this.typir.conversion.isConvertibleTo(source, target)) {
            return true;
        }

        // allow the types kind to determine the assignability
        if (source.kind.$type === target.kind.$type) {
            return source.kind.isAssignable(source, target);
        }

        return false;
    }
}
