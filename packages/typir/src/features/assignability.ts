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
        // TODO does it make sense to check that? depending on the kind, this calculation might be quite complex as well
        if (this.typir.equality.areTypesEqual(source, target)) {
            return true;
        }

        // explicit conversion possible?
        if (this.typir.conversion.isConvertibleTo(source, target)) {
            return true;
        }

        // allow the types kind to determine the assignability
        if (source.kind.$type === target.kind.$type) {
            // TODO prevent loops due to recursion, cache results
            return source.kind.isAssignable(source, target);
        }

        return false;
    }
}
