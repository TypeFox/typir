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

    isAssignable(source: Type, target: Type): boolean {
        return isPrimitiveKind(source.kind) && isPrimitiveKind(target.kind) && source.name === target.name;
    }
}

export function isPrimitiveKind(kind: unknown): kind is PrimitiveKind {
    return isKind(kind) && kind.$type === 'PrimitiveKind';
}
