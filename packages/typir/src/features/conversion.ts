// eslint-disable-next-line header/header
import { Type, TypeEdge } from '../graph/type-graph';
import { Typir } from '../main';

export interface TypeConversion {
    markAsConvertible(from: Type | Type[], to: Type | Type[]): void
    isConvertibleTo(from: Type, to: Type): boolean;
}

export class DefaultTypeConversion implements TypeConversion {
    protected readonly typir: Typir;

    constructor(typir: Typir) {
        this.typir = typir;
    }

    markAsConvertible(from: Type | Type[], to: Type | Type[]): void {
        const allFrom = Array.isArray(from) ? from : [from];
        const allTo = Array.isArray(to) ? to : [to];
        for (const f of allFrom) {
            for (const t of allTo) {
                this.markAsConvertibleSingle(f, t);
            }
        }
    }
    protected markAsConvertibleSingle(from: Type, to: Type): void {
        if (this.isConvertibleTo(from, to)) {
            return; // is already marked as convertible
        }
        const edge = new TypeEdge(from, to, TYPE_CONVERSION);
        this.typir.graph.addEdge(edge);
    }

    isConvertibleTo(from: Type, to: Type): boolean {
        return from.getOutgoingEdges(TYPE_CONVERSION).find(edge => edge.to === to) !== undefined;
    }
}

const TYPE_CONVERSION = 'isConvertibleTo';
