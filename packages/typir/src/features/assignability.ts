// eslint-disable-next-line header/header
import { Type } from '../graph/type-graph';
import { Typir } from '../typir';

export interface TypeAssignability {
    isAssignable(source: Type, target: Type): boolean; // target := source;
}

export class DefaultTypeAssignability implements TypeAssignability {
    protected readonly typir: Typir;

    constructor(typir: Typir) {
        this.typir = typir;
    }

    isAssignable(source: Type, target: Type): boolean {
        // conversion possible?
        if (this.typir.conversion.isConvertibleTo(source, target, 'IMPLICIT')) {
            return true;
        }

        // allow the types kind to determine about sub-type relationships
        if (this.typir.subtype.isSubType(target, source)) {
            return true;
        }

        return false;
    }
}
