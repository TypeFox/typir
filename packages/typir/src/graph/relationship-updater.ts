/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeReference, TypeReferenceListener } from '../initialization/type-reference.js';
import { EqualityEdge, TypeEquality, TypeEqualityListener } from '../services/equality.js';
import { TypirServices, TypirSpecifics } from '../typir.js';
import { areTypesEqualUtility } from '../utils/utils-type-comparison.js';
import { isTypeEdge, TypeEdge } from './type-edge.js';
import { TypeGraph } from './type-graph.js';
import { isType, Type } from './type-node.js';

/**
 * This service ensures,
 * that relationships betweed types which depend on other relationships are updated according to added/removed relationships.
 * This service is an internal one and usually don't need to be used by users of Typir.
 *
 * As an example, the difference between two function types F1 and F2 are only different types A and B for their input parameter.
 * If A and B are marked as equal (since, for example, A is an alias for B), F1 and F2 become equal as well.
 * While A and B are manually marked as equal by calling the Equality service, this service takes care about marking F1 and F2 as equal automatically.
 *
 * Main motivation for this service is to provide a performant solution for such transitive updates.
 * Main idea for that is, that A is related by a "use"-edge with F1 and B with F2 to check only related types for updates.
 */
export interface RelationshipUpdater<Specifics extends TypirSpecifics> { // TODO Review: better names?
    markUseAsRelevantForEquality(user: Type, using: Type | TypeReference<Type, Specifics>): void;
}

export class DefaultRelationshipUpdater<Specifics extends TypirSpecifics> implements RelationshipUpdater<Specifics>, TypeEqualityListener {

    protected readonly graph: TypeGraph;
    protected readonly equality: TypeEquality;

    protected internalUpdate: boolean = false;
    protected newEqualityEdges: EqualityEdge[] = [];
    protected deletedEqualityEdges: EqualityEdge[] = [];

    constructor(services: TypirServices<Specifics>) {
        this.graph = services.infrastructure.Graph;
        this.equality = services.Equality;

        services.Equality.addListener(this, { callOnMarkedForAllExisting: false });
    }

    markUseAsRelevantForEquality(user: Type, using: Type | TypeReference<Type, Specifics>): void {
        if (isType(using)) {
            this.getOrCreateUseEdge(user, using).relevantForEquality = true;
        } else {
            using.addListener(this.createTypeRefListener(user), true);
        }
    }

    protected createTypeRefListener(user: Type): TypeReferenceListener<Type, Specifics> {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const updater = this;
        return {
            onTypeReferenceResolved(_reference, resolvedType) {
                updater.getOrCreateUseEdge(user, resolvedType).relevantForEquality = true;
            },
            onTypeReferenceInvalidated(_reference, previousType) {
                if (previousType) {
                    const edge = updater.getCreateUseEdge(user, previousType);
                    if (edge) {
                        // maybe some other relationships are marked along this edge => don't delete them by deleting the edge
                        edge.relevantForEquality = false;
                    } else {
                        // no edge => nothing to remove
                    }
                }
            },
        };
    }

    onMarkedEqual(_type1: Type, _type2: Type, edge: EqualityEdge): void {
        this.newEqualityEdges.push(edge);
        if (this.internalUpdate) {
            return; // the internal update-loop is already started, don't start it again
        }
        this.internalUpdate = true;
        this.update();
        this.internalUpdate = false;
    }

    onUnmarkedEqual(_type1: Type, _type2: Type, edge: EqualityEdge): void {
        this.deletedEqualityEdges.push(edge);
        if (this.internalUpdate) {
            return; // the internal update-loop is already started, don't start it again
        }
        this.internalUpdate = true;
        this.update();
        this.internalUpdate = false;
    }

    protected update(): void {
        // new edges: compare all direct users whether they are equal now
        while (this.newEqualityEdges.length >= 1) {
            const newEdge = this.newEqualityEdges.pop()!;

            for (const userOfType1 of this.getUsersOf(newEdge.from)) {
                for (const userOfType2 of this.getUsersOf(newEdge.to)) {
                    if (this.equality.areTypesEqual(userOfType1, userOfType2) === false && areTypesEqualUtility(userOfType1, userOfType2) === true) {
                        this.equality.markAsEqual(userOfType1, userOfType2);
                        // if this relationship is new, another `onMarkedEqual` event is sent, the corresponding new edge is remembered and its users will be later checked as well
                    }
                }
            }
        }

        // deleted edges: compare all direct users whether they are not equal anymore
        while (this.deletedEqualityEdges.length >= 1) {
            const deletedEdge = this.deletedEqualityEdges.pop()!;

            for (const userOfType1 of this.getUsersOf(deletedEdge.from)) {
                for (const userOfType2 of this.getUsersOf(deletedEdge.to)) {
                    if (this.equality.areTypesEqual(userOfType1, userOfType2) === true && areTypesEqualUtility(userOfType1, userOfType2) === false) {
                        this.equality.unmarkAsEqual(userOfType1, userOfType2);
                        // if this relationship is deleted, another `onUnmarkedEqual` event is sent, the corresponding deleted edge is remembered and its users will be later checked as well
                    }
                }
            }
        }
    }

    protected getUsersOf(used: Type): Type[] {
        return used.getIncomingEdges<UseEdge>(UseEdge).filter(edge => edge.cachingInformation === 'LINK_EXISTS' && edge.relevantForEquality).map(edge => edge.from);
    }

    protected getCreateUseEdge(user: Type, using: Type): UseEdge | undefined {
        return user.getOutgoingEdges<UseEdge>(UseEdge).find(edge => edge.to === using);
    }

    protected getOrCreateUseEdge(user: Type, using: Type): UseEdge {
        let edge = this.getCreateUseEdge(user, using);
        if (edge === undefined) {
            edge = {
                $relation: UseEdge,
                from: user,
                to: using,
                cachingInformation: 'LINK_EXISTS',
                relevantForEquality: false,
            };
            this.graph.addEdge(edge);
        }
        return edge;
    }

}


export interface UseEdge extends TypeEdge { // is directed!
    readonly $relation: 'UseEdge';
    relevantForEquality: boolean;
}
export const UseEdge = 'UseEdge';

export function isUseEdge(edge: unknown): edge is UseEdge {
    return isTypeEdge(edge) && edge.$relation === UseEdge;
}
