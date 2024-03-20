/* eslint-disable header/header */
import { Type, TypeEdge } from '../graph/type-graph';
import { Typir } from '../typir';

export interface TypeRelationshipCaching {
    getRelationship(from: Type, to: Type, meaning: string, directed: boolean): RelationshipKind;
    setRelationship(from: Type, to: Type, meaning: string, directed: boolean, newValue: RelationshipKind | undefined): void;
}

export type RelationshipKind = 'PENDING' | 'UNKNOWN' | 'LINK_EXISTS' | 'NO_LINK';

export class DefaultTypeRelationshipCaching implements TypeRelationshipCaching {
    protected readonly typir: Typir;

    constructor(typir: Typir) {
        this.typir = typir;
    }

    getRelationship(from: Type, to: Type, meaning: string, directed: boolean): RelationshipKind {
        let edge = this.getEdge(from, to, meaning);
        if (!edge && directed === false) {
            // in case of non-directed edges, check the opposite direction as well
            edge = this.getEdge(to, from, meaning);
        }
        if (edge) {
            const result = edge.properties.get(TYPE_CACHING);
            if (result && typeof result === 'string') {
                return result as RelationshipKind;
            }
        }
        return 'UNKNOWN';
    }

    setRelationship(from: Type, to: Type, meaning: string, _directed: boolean, newValue: RelationshipKind | undefined): void {
        // be default, don't cache UNKNOWN and NO_LINK values (but ensure, that PENDING is overridden/updated!)
        if (newValue === 'UNKNOWN' || newValue === 'NO_LINK') {
            newValue = undefined; // 'undefined' indicates to remove an existing edge
        }

        // manage the edge to store the value
        let edge = this.getEdge(from, to, meaning);
        if (newValue === undefined) {
            // un-set the relationship
            if (edge) {
                this.typir.graph.removeEdge(edge);
            }
            return;
        }
        if (!edge) {
            // create missing edge
            edge = new TypeEdge(from, to, meaning);
            this.typir.graph.addEdge(edge);
        }

        // set/update the value
        edge.properties.set(TYPE_CACHING, newValue);
    }

    protected getEdge(from: Type, to: Type, meaning: string): TypeEdge | undefined {
        return from.getOutgoingEdges(meaning).find(edge => edge.to === to);
    }
}

const TYPE_CACHING = 'TypeRelationshipCaching_Value';
