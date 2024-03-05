// eslint-disable-next-line header/header
import { Type } from '../graph/type-graph';
import { Typir } from '../main';
import { Kind } from './kind';

export class PrimitiveKind extends Kind {
    readonly $type: 'PrimitiveKind';

    constructor(typir: Typir) {
        super(typir);
    }

    createPrimitiveType(primitiveName: string): Type {
        const primitiveType = new Type(this, primitiveName);
        this.typir.graph.addNode(primitiveType);
        return primitiveType;
    }

    areAssignable(left: Type, right: Type): boolean {
        return left.name === right.name;
    }
}
