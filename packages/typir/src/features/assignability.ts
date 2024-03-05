// eslint-disable-next-line header/header
import { Type } from '../graph/type-graph';
import { Typir } from '../main';

export interface TypeAssignability {
    areAssignable(left: Type, right: Type): boolean;
}

export class DefaultTypeAssignability implements TypeAssignability {
    protected readonly typir: Typir;

    constructor(typir: Typir) {
        this.typir = typir;
    }

    areAssignable(left: Type, right: Type): boolean {
        // same types?
        if (left === right) {
            return true;
        }

        // explicit conversation possible?
        if (this.typir.conversation.isConvertibleTo(right, left)) {
            return true;
        }

        // allow the types kind to determine the assignability
        if (left.kind.$type === right.kind.$type) {
            return left.kind.areAssignable(left, right);
        }

        return false;
    }
}
