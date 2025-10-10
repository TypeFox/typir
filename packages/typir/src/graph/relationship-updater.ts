/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeReference, TypeReferenceListener } from '../initialization/type-reference.js';
import { EqualityEdge, TypeEquality, TypeEqualityListener } from '../services/equality.js';
import { SubType, SubTypeEdge, SubTypeListener } from '../services/subtype.js';
import { TypirServices, TypirSpecifics } from '../typir.js';
import { areTypesEqualUtility, areTypesSubTypesUtility } from '../utils/utils-type-comparison.js';
import { isTypeEdge, TypeEdge } from './type-edge.js';
import { TypeGraph } from './type-graph.js';
import { isType, Type } from './type-node.js';

/**
 * This service ensures,
 * that relationships betweed types which depend on other relationships are updated according to added/removed relationships.
 * This service handles neither new nor deleted types, it handles added/removed edges only.
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
    markUseAsRelevant(user: Type, using: Type | TypeReference<Type, Specifics>, details: SpecifyUseEdgeDetails): void;
    unmarkUseAsRelevant(user: Type, using: Type, details: SpecifyUseEdgeDetails): void;
}

export class DefaultRelationshipUpdater<Specifics extends TypirSpecifics> implements RelationshipUpdater<Specifics>, TypeEqualityListener, SubTypeListener {

    protected readonly graph: TypeGraph;
    protected readonly equality: TypeEquality;
    protected readonly subtype: SubType;

    protected internalUpdate: boolean = false;
    protected newEqualityEdges: EqualityEdge[] = [];
    protected deletedEqualityEdges: EqualityEdge[] = [];
    protected newSubtypeEdges: SubTypeEdge[] = [];
    protected deletedSubtypeEdges: SubTypeEdge[] = [];

    constructor(services: TypirServices<Specifics>) {
        this.graph = services.infrastructure.Graph;
        this.equality = services.Equality;
        this.subtype = services.Subtype;

        services.Equality.addListener(this, { callOnMarkedForAllExisting: false });
        services.Subtype.addListener(this, { callOnMarkedForAllExisting: false});
    }

    markUseAsRelevant(user: Type, using: Type | TypeReference<Type, Specifics>, details: SpecifyUseEdgeDetails): void {
        if (isType(using)) {
            this.markUse(user, using, details);
        } else {
            using.addListener(this.createTypeRefListener(user, details), true);
        }
    }

    protected createTypeRefListener(user: Type, details: SpecifyUseEdgeDetails): TypeReferenceListener<Type, Specifics> {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const updater = this;
        return {
            onTypeReferenceResolved(_reference, resolvedType) {
                updater.markUse(user, resolvedType, details);
            },
            onTypeReferenceInvalidated(_reference, previousType) {
                if (previousType) {
                    updater.unmarkUse(user, previousType, details);
                }
            },
        };
    }

    unmarkUseAsRelevant(user: Type, using: Type, details: SpecifyUseEdgeDetails): void {
        this.unmarkUse(user, using, details);
    }

    protected markUse(user: Type, using: Type, details: SpecifyUseEdgeDetails): void {
        const edge = this.getOrCreateUseEdge(user, using);
        if (details.updateEquality === true) {
            edge.updateEquality++;
        }
        if (details.updateSubType === true) {
            edge.updateSubType++;
        }
        if (details.updateSubTypeSwitched === true) {
            edge.updateSubTypeSwitched++;
        }
    }

    protected unmarkUse(user: Type, using: Type, details: SpecifyUseEdgeDetails): void {
        const edge = this.getUseEdge(user, using);
        if (edge) {
            // maybe some other relationships are marked along this edge => don't delete them by deleting the edge
            if (details.updateEquality === true) {
                edge.updateEquality--;
                if (edge.updateEquality < 0) {
                    throw new Error(`${user.getIdentifier()} --> ${using.getIdentifier()}: unmarking equality is impossible, since there is no relationship remaining!`);
                }
            }
            if (details.updateSubType === true) {
                edge.updateSubType--;
                if (edge.updateSubType < 0) {
                    throw new Error(`${user.getIdentifier()} --> ${using.getIdentifier()}: unmarking sub-type is impossible, since there is no relationship remaining!`);
                }
            }
            if (details.updateSubTypeSwitched === true) {
                edge.updateSubTypeSwitched--;
                if (edge.updateSubTypeSwitched < 0) {
                    throw new Error(`${user.getIdentifier()} --> ${using.getIdentifier()}: unmarking switched sub-type is impossible, since there is no relationship remaining!`);
                }
            }
        } else {
            throw new Error(`${user.getIdentifier()} --> ${using.getIdentifier()}: unmarking is impossible, since there is no use-relationship!`);
        }
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

    onMarkedSubType(_subType: Type, _superType: Type, edge: SubTypeEdge): void {
        this.newSubtypeEdges.push(edge);
        if (this.internalUpdate) {
            return; // the internal update-loop is already started, don't start it again
        }
        this.internalUpdate = true;
        this.update();
        this.internalUpdate = false;
    }

    onUnmarkedSubType(_subType: Type, _superType: Type, edge: SubTypeEdge): void {
        this.deletedSubtypeEdges.push(edge);
        if (this.internalUpdate) {
            return; // the internal update-loop is already started, don't start it again
        }
        this.internalUpdate = true;
        this.update();
        this.internalUpdate = false;
    }

    protected update(): void {
        // new equality edges: compare all direct users whether they are equal now
        while (this.newEqualityEdges.length >= 1) {
            const newEdge = this.newEqualityEdges.pop()!;

            for (const userOfType1 of this.getUsersOf(newEdge.from, { updateEquality: true })) {
                for (const userOfType2 of this.getUsersOf(newEdge.to, { updateEquality: true })) {
                    if (this.equality.areTypesEqual(userOfType1, userOfType2) === false && areTypesEqualUtility(userOfType1, userOfType2) === true) {
                        this.equality.markAsEqual(userOfType1, userOfType2);
                        // if this relationship is new, another `onMarkedEqual` event is sent, the corresponding new edge is remembered and its users will be later checked as well
                    }
                }
            }
        }

        // was passiert, wenn ein Use für Equality UND SubType relevant ist?? nur eine Schleife für New und eine für Deleted, die aber Equality, Sub und Super gemeinsam behandeln?
        // Es gibt zwei Aspekte für Beziehungen zu den verwendeten Typen:
        //   - auf welche Art von new/deleted Edges (Equality, SubType) müssen wir reagieren?
        //   - müssen wir darausfolgend auf neue/veraltete Equality- und/oder SubType-Beziehungen prüfen? (aus einer neuen Equality-Kante kann z.B. eine neue SubType-Kante entstehen!)
        // Oder nur Use-Kanten ohne Properties und einfach immer Equality und SubType überprüfen?
        // Diese Logik hier muss zwei Aspekte wissen, wenn sich ein Edge von A nach B verändert:
        //   - Welche Typen V_A und V_B muss ich jetzt miteinander vergleichen?
        //       --> einfach alle Verwender von A mit allen Verwendern von B vergleichen oder lässt sich das noch weiter reduzieren?
        //       --> V_A und V_B müssen den Type A bzw. B mit der/den veränderten Beziehung(en) auf diesselbe Art und Weise verwenden! d.h. beide als Output oder beide als Input ?==>? gleiche Properties?
        //       --> ob Sub oder Super liegt nicht an der Use-Beziehung sondern an der Beziehung zwischen A und B (?)
        //       --> lässt sich das überhaupt sinnvoll generisch lösen?
        //   - Vergleich auf Equality und/oder Sub/SuperType
        //       --> aus Equality kann Equality OR SubType entstehen, aber aus SubType kann nur weiterer TypeType entstehen; d.h. aus Art der neuen Kante könnte abgeleitet werden, was jetzt überprüft wird
        // Verwendungs-Properties customizable machen, für custom types, für weitere Performanz-Optimierungen
        // können Factories diesen allgemeinen Mechanismus hier anpassen oder ausschalten? z.B. Functions können wegen gleichem Namen deutlich performanter überprüft werden!
        //   - Typen dürfen andere Typen verwenden, auch ohen Use-Kanten anzulegen: ist nur ein Mittel für Performanz-Optimierungen hier!

        // new sub-type edges: compare all direct users whether they are in a sub-type-relationship now
        while (this.newSubtypeEdges.length >= 1) {
            const newEdge = this.newSubtypeEdges.pop()!; // sub --> super

            // Is "user of sub" a sub-type of "user of super"?
            for (const userOfSub of this.getUsersOf(newEdge.from, { updateSubType: true })) {
                for (const userOfSuper of this.getUsersOf(newEdge.to, { updateSubType: true })) {
                    if (this.subtype.isSubType(userOfSub, userOfSuper) === false && areTypesSubTypesUtility(userOfSub, userOfSuper) === true) {
                        this.subtype.markAsSubType(userOfSub, userOfSuper);
                    }
                }
            }
            // Is "user of super" a sub-type "user of sub"?
            for (const userOfSub of this.getUsersOf(newEdge.from, { updateSubTypeSwitched: true })) {
                for (const userOfSuper of this.getUsersOf(newEdge.to, { updateSubTypeSwitched: true })) {
                    if (this.subtype.isSubType(userOfSuper, userOfSub) === false && areTypesSubTypesUtility(userOfSuper, userOfSub) === true) {
                        this.subtype.markAsSubType(userOfSuper, userOfSub);
                    }
                }
            }
        }

        // TODO

        // deleted equality edges: compare all direct users whether they are not equal anymore
        while (this.deletedEqualityEdges.length >= 1) {
            const deletedEdge = this.deletedEqualityEdges.pop()!;

            for (const userOfType1 of this.getUsersOf(deletedEdge.from, { updateEquality: true })) {
                for (const userOfType2 of this.getUsersOf(deletedEdge.to, { updateEquality: true })) {
                    if (this.equality.areTypesEqual(userOfType1, userOfType2) === true && areTypesEqualUtility(userOfType1, userOfType2) === false) {
                        this.equality.unmarkAsEqual(userOfType1, userOfType2);
                        // if this relationship is deleted, another `onUnmarkedEqual` event is sent, the corresponding deleted edge is remembered and its users will be later checked as well
                    }
                }
            }
        }

        // deleted sub-type edges: compare all direct users whether they are not in a sub-type-relationship anymore
        while (this.deletedSubtypeEdges.length >= 1) {
            const deletedEdge = this.deletedSubtypeEdges.pop()!; // sub --> super

            // Is "user of sub" no sub-type of "user of super" anymore?
            for (const userOfSub of this.getUsersOf(deletedEdge.from, { updateSubType: true })) {
                for (const userOfSuper of this.getUsersOf(deletedEdge.to, { updateSubType: true })) {
                    if (this.subtype.isSubType(userOfSub, userOfSuper) === true && areTypesSubTypesUtility(userOfSub, userOfSuper) === false) {
                        this.subtype.unmarkAsSubType(userOfSub, userOfSuper);
                    }
                }
            }
            // Is "user of super" no sub-type "user of sub" anymore?
            for (const userOfSub of this.getUsersOf(deletedEdge.from, { updateSubTypeSwitched: true })) {
                for (const userOfSuper of this.getUsersOf(deletedEdge.to, { updateSubTypeSwitched: true })) {
                    if (this.subtype.isSubType(userOfSuper, userOfSub) === true && areTypesSubTypesUtility(userOfSuper, userOfSub) === false) {
                        this.subtype.unmarkAsSubType(userOfSuper, userOfSub);
                    }
                }
            }
        }

    }

    protected getUsersOf(used: Type, conditions: Partial<UseEdgeDetails>): Type[] {
        return used.getIncomingEdges<UseEdge>(UseEdge).filter(edge => edge.cachingInformation === 'LINK_EXISTS'
            && (conditions.updateEquality        === undefined ? true : conditions.updateEquality        === true ? edge.updateEquality        >= 1 : edge.updateEquality        === 0)
            && (conditions.updateSubType         === undefined ? true : conditions.updateSubType         === true ? edge.updateSubType         >= 1 : edge.updateSubType         === 0)
            && (conditions.updateSubTypeSwitched === undefined ? true : conditions.updateSubTypeSwitched === true ? edge.updateSubTypeSwitched >= 1 : edge.updateSubTypeSwitched === 0)
        ).map(edge => edge.from);
    }

    protected getUseEdge(user: Type, using: Type): UseEdge | undefined {
        return user.getOutgoingEdges<UseEdge>(UseEdge).find(edge => edge.to === using);
    }

    protected getOrCreateUseEdge(user: Type, using: Type): UseEdge {
        let edge = this.getUseEdge(user, using);
        if (edge === undefined) {
            edge = {
                $relation: UseEdge,
                from: user,
                to: using,
                cachingInformation: 'LINK_EXISTS',
                updateEquality:        0,
                updateSubType:         0,
                updateSubTypeSwitched: 0,
            };
            this.graph.addEdge(edge);
        }
        return edge;
    }

}


/**
 * Directed edge to indicate, that a type (from) uses another type (to).
 * The properties/flags of this edge determine, for which update scenarios this use is relevant.
 */
export interface UseEdge extends TypeEdge, StoreUseEdgeDetails {
    readonly $relation: 'UseEdge';
}
export const UseEdge = 'UseEdge';

export function isUseEdge(edge: unknown): edge is UseEdge {
    return isTypeEdge(edge) && edge.$relation === UseEdge;
}


export interface UseEdgeDetails {
    updateEquality: boolean;
    updateSubType: boolean;
    updateSubTypeSwitched: boolean;
}

export type StoreUseEdgeDetails = { // replace booleans by numbers
    [K in keyof UseEdgeDetails]: UseEdgeDetails[K] extends boolean ? number : UseEdgeDetails[K];
};
export type SpecifyUseEdgeDetails = Partial<{ // replace booleans by true and make all properties optional
    [K in keyof UseEdgeDetails]: UseEdgeDetails[K] extends boolean ? true : UseEdgeDetails[K];
}>;
