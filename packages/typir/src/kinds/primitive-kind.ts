// eslint-disable-next-line header/header
import { Type } from '../graph/type-graph';
import { Typir } from '../main';
import { Kind, isKind } from './kind';

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

    override isAssignable(source: Type, target: Type): boolean {
        return this.areTypesEqual(source, target);
    }

    override areTypesEqual(type1: Type, type2: Type): boolean {
        return isPrimitiveKind(type1.kind) && isPrimitiveKind(type2.kind) && type1.name === type2.name;
    }
}

export function isPrimitiveKind(kind: unknown): kind is PrimitiveKind {
    return isKind(kind) && kind.$type === 'PrimitiveKind';
}
