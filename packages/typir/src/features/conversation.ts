// eslint-disable-next-line header/header
import { Type, TypeEdge } from '../graph/type-graph';
import { Typir } from '../main';

export interface TypeConversation {
    markAsConvertible(from: Type, to: Type): void
    isConvertibleTo(from: Type, to: Type): boolean;
}

export class DefaultTypeConversation implements TypeConversation {
    protected readonly typir: Typir;

    constructor(typir: Typir) {
        this.typir = typir;
    }

    markAsConvertible(from: Type, to: Type): void {
        const edge = new TypeEdge(from, to, TYPE_CONVERSATION);
        this.typir.graph.addEdge(edge);
    }

    isConvertibleTo(from: Type, to: Type): boolean {
        return from.getOutgoingEdges(TYPE_CONVERSATION).find(edge => edge.to === to) !== undefined;
    }
}

const TYPE_CONVERSATION = 'isConvertibleTo';
