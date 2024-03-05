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
        if (left.name === right.name) {
            return true;
        }

        // conversation?
        if (this.typir.conversation.isConvertibleTo(right, left)) {
            return true;
        }

        return false;
    }
}
