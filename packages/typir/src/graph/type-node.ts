/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Kind, isKind } from '../kinds/kind.js';
import { TypeReference, TypirProblem, WaitingForInvalidTypeReferences, WaitingForResolvedTypeReferences } from '../utils/utils-definitions.js';
import { assertTrue, assertUnreachable } from '../utils/utils.js';
import { TypeEdge } from './type-edge.js';

// export type TypeInitializationState = 'Created' | 'Identifiable' | 'Completed';
export type TypeInitializationState = 'Invalid' | 'Identifiable' | 'Completed';

export interface PreconditionsForInitializationState {
    refsToBeIdentified?: TypeReference[]; // or later/more
    refsToBeCompleted?: TypeReference[]; // or later/more
}

/**
 * Design decisions:
 * - features of types are realized/determined by their kinds
 * - Names of types must be unique!
 */
export abstract class Type {
    readonly kind: Kind; // => $kind: string, required for isXType() checks
    /* Design decision for the name of this attribute
     * - identifier
     * - ID: sounds like an arbitrary, internal value without schema behind
     * - name: what is the name of a union type?
     * 'undefined' is required for cases, when the identifier is calculated later, since required information is not yet available.
     */
    protected identifier: string | undefined;

    // this is required only to apply graph algorithms in a generic way!
    // $relation is used as key
    protected readonly edgesIncoming: Map<string, TypeEdge[]> = new Map();
    protected readonly edgesOutgoing: Map<string, TypeEdge[]> = new Map();

    constructor(identifier: string | undefined) {
        this.identifier = identifier;
    }


    /**
     * Identifiers must be unique and stable for all types known in a single Typir instance, since they are used as key to store types in maps.
     * Identifiers might have a naming schema for calculatable values.
     */
    getIdentifier(): string {
        this.assertStateOrLater('Identifiable');
        assertTrue(this.identifier !== undefined);
        return this.identifier;
    }

    /**
     * Returns a string value containing a short representation of the type to be shown to users of the type-checked elements.
     * This value don't need to be unique for all types.
     * This name should be quite short.
     * Services should not call this function directly, but typir.printer.printTypeName(...) instead.
     * @returns a short string value to show to the user
     */
    abstract getName(): string;

    /**
     * Calculates a string value which might be shown to users of the type-checked elements.
     * This value don't need to be unique for all types.
     * This representation might be longer and show lots of details of the type.
     * Services should not call this function directly, but typir.printer.printTypeUserRepresentation(...) instead.
     * @returns a longer string value to show to the user
     */
    abstract getUserRepresentation(): string;



    protected initialization: TypeInitializationState = 'Invalid'; // TODO or Identifiable

    getInitializationState(): TypeInitializationState {
        return this.initialization;
    }

    protected assertState(expectedState: TypeInitializationState): void {
        if (this.isInState(expectedState) === false) {
            throw new Error(`The current state of type '${this.identifier}' is ${this.initialization}, but ${expectedState} is expected.`);
        }
    }
    protected assertNotState(expectedState: TypeInitializationState): void {
        if (this.isNotInState(expectedState) === false) {
            throw new Error(`The current state of type '${this.identifier}' is ${this.initialization}, but this state is not expected.`);
        }
    }
    protected assertStateOrLater(expectedState: TypeInitializationState): void {
        if (this.isInStateOrLater(expectedState) === false) {
            throw new Error(`The current state of type '${this.identifier}' is ${this.initialization}, but this state is not expected.`);
        }
    }

    isInState(state: TypeInitializationState): boolean {
        return this.initialization === state;
    }
    isNotInState(state: TypeInitializationState): boolean {
        return this.initialization !== state;
    }
    isInStateOrLater(state: TypeInitializationState): boolean {
        switch (state) {
            case 'Invalid':
                return true;
            case 'Identifiable':
                return this.initialization !== 'Invalid';
            case 'Completed':
                return this.initialization === 'Completed';
            default:
                assertUnreachable(state);
        }
    }

    // manage listeners for updated state of the current type

    protected stateListeners: TypeStateListener[] = [];

    addListener(listener: TypeStateListener, informIfAlreadyFulfilled: boolean): void {
        this.stateListeners.push(listener);
        if (informIfAlreadyFulfilled) {
            const currentState = this.getInitializationState();
            switch (currentState) {
                case 'Invalid':
                    // TODO?
                    break;
                case 'Identifiable':
                    listener.switchedToIdentifiable(this);
                    break;
                case 'Completed':
                    listener.switchedToIdentifiable(this);
                    listener.switchedToCompleted(this);
                    break;
                default:
                    assertUnreachable(currentState);
            }
        }
    }

    removeListener(listener: TypeStateListener): void {
        const index = this.stateListeners.indexOf(listener);
        if (index >= 0) {
            this.stateListeners.splice(index, 1);
        }
    }


    // to be called at the end of the constructor of each specific Type implementation!
    protected completeInitialization(preconditions: {
        preconditionsForInitialization?: PreconditionsForInitializationState,
        preconditionsForCompletion?: PreconditionsForInitializationState,
        referencesRelevantForInvalidation?: TypeReference[],
        onIdentification?: () => void,
        onCompletion?: () => void,
        onInvalidation?: () => void,
    }): void {
        // store the reactions
        this.onIdentification = preconditions.onIdentification ?? (() => {});
        this.onCompletion = preconditions.onCompletion ?? (() => {});
        this.onInvalidation = preconditions.onInvalidation ?? (() => {});

        if (this.kind.$name === 'ClassKind') {
            console.log('');
        }
        // preconditions for Identifiable
        const init1 = new WaitingForResolvedTypeReferences(
            preconditions.preconditionsForInitialization?.refsToBeIdentified,
            preconditions.preconditionsForInitialization?.refsToBeCompleted,
            this,
        );
        // preconditions for Completed
        const init2 = new WaitingForResolvedTypeReferences(
            preconditions.preconditionsForCompletion?.refsToBeIdentified,
            preconditions.preconditionsForCompletion?.refsToBeCompleted,
            this,
        );
        // preconditions for Invalid
        const init3 = new WaitingForInvalidTypeReferences(
            preconditions.referencesRelevantForInvalidation ?? [],
        );

        // invalid --> identifiable
        init1.addListener(() => {
            this.switchFromInvalidToIdentifiable();
            if (init2.isFulfilled()) {
                // this is required to ensure the stric order Identifiable --> Completed, since 'init2' might already be triggered
                this.switchFromIdentifiableToCompleted();
            }
        }, true);
        // identifiable --> completed
        init2.addListener(() => {
            if (init1.isFulfilled()) {
                this.switchFromIdentifiableToCompleted();
            } else {
                // switching will be done later by 'init1' in order to conform to the stric order Identifiable --> Completed
            }
        }, false); // not required, since init1 will switch to Completed as well!
        // identifiable/completed --> invalid
        init3.addListener(() => {
            if (this.isNotInState('Invalid')) {
                this.switchFromCompleteOrIdentifiableToInvalid();
            }
        }, false); // no initial trigger!
    }

    protected onIdentification: () => void; // typical use cases: calculate the identifier
    protected onCompletion: () => void; // typical use cases: determine all properties which depend on other types to be created
    protected onInvalidation: () => void; // TODO ist jetzt anders; typical use cases: register inference rules for the type object already now!

    protected switchFromInvalidToIdentifiable(): void {
        this.assertState('Invalid');
        this.onIdentification();
        this.initialization = 'Identifiable';
        this.stateListeners.slice().forEach(listener => listener.switchedToIdentifiable(this)); // slice() prevents issues with removal of listeners during notifications
    }

    protected switchFromIdentifiableToCompleted(): void {
        this.assertState('Identifiable');
        this.onCompletion();
        this.initialization = 'Completed';
        this.stateListeners.slice().forEach(listener => listener.switchedToCompleted(this)); // slice() prevents issues with removal of listeners during notifications
    }

    protected switchFromCompleteOrIdentifiableToInvalid(): void {
        this.assertNotState('Invalid');
        this.onInvalidation();
        this.initialization = 'Invalid';
        this.stateListeners.slice().forEach(listener => listener.switchedToInvalid(this)); // slice() prevents issues with removal of listeners during notifications
    }



    /**
     * Analyzes, whether two types are equal.
     * @param otherType to be compared with the current type
     * @returns an empty array, if both types are equal, otherwise some problems which might point to found differences/conflicts between the two types.
     * These problems are presented to users in order to support them with useful information about the result of this analysis.
     */
    abstract analyzeTypeEqualityProblems(otherType: Type): TypirProblem[];

    /**
     * Analyzes, whether there is a sub type-relationship between two types.
     * The difference between sub type-relationships and super type-relationships are only switched types.
     * If both types are the same, no problems will be reported, since a type is considered as sub-type of itself (by definition).
     *
     * @param superType the super type, while the current type is the sub type
     * @returns an empty array, if the relationship exists, otherwise some problems which might point to violations of the investigated relationship.
     * These problems are presented to users in order to support them with useful information about the result of this analysis.
     */
    abstract analyzeIsSubTypeOf(superType: Type): TypirProblem[];

    /**
     * Analyzes, whether there is a super type-relationship between two types.
     * The difference between sub type-relationships and super type-relationships are only switched types.
     * If both types are the same, no problems will be reported, since a type is considered as sub-type of itself (by definition).
     *
     * @param subType the sub type, while the current type is super type
     * @returns an empty array, if the relationship exists, otherwise some problems which might point to violations of the investigated relationship.
     * These problems are presented to users in order to support them with useful information about the result of this analysis.
     */
    abstract analyzeIsSuperTypeOf(subType: Type): TypirProblem[];


    addIncomingEdge(edge: TypeEdge): void {
        const key = edge.$relation;
        if (this.edgesIncoming.has(key)) {
            this.edgesIncoming.get(key)!.push(edge);
        } else {
            this.edgesIncoming.set(key, [edge]);
        }
    }
    addOutgoingEdge(edge: TypeEdge): void {
        const key = edge.$relation;
        if (this.edgesOutgoing.has(key)) {
            this.edgesOutgoing.get(key)!.push(edge);
        } else {
            this.edgesOutgoing.set(key, [edge]);
        }
    }

    removeIncomingEdge(edge: TypeEdge): boolean {
        const key = edge.$relation;
        const list = this.edgesIncoming.get(key);
        if (list) {
            const index = list.indexOf(edge);
            if (index >= 0) {
                list.splice(index, 1);
                if (list.length <= 0) {
                    this.edgesIncoming.delete(key);
                }
                return true;
            }
        }
        return false;
    }
    removeOutgoingEdge(edge: TypeEdge): boolean {
        const key = edge.$relation;
        const list = this.edgesOutgoing.get(key);
        if (list) {
            const index = list.indexOf(edge);
            if (index >= 0) {
                list.splice(index, 1);
                if (list.length <= 0) {
                    this.edgesOutgoing.delete(key);
                }
                return true;
            }
        }
        return false;
    }

    getIncomingEdges<T extends TypeEdge>($relation: T['$relation']): T[] {
        return this.edgesIncoming.get($relation) as T[] ?? [];
    }
    getOutgoingEdges<T extends TypeEdge>($relation: T['$relation']): T[] {
        return this.edgesOutgoing.get($relation) as T[] ?? [];
    }
    getEdges<T extends TypeEdge>($relation: T['$relation']): T[] {
        return [
            ...this.getIncomingEdges($relation),
            ...this.getOutgoingEdges($relation),
        ];
    }

    getAllIncomingEdges(): TypeEdge[] {
        return Array.from(this.edgesIncoming.values()).flat();
    }
    getAllOutgoingEdges(): TypeEdge[] {
        return Array.from(this.edgesOutgoing.values()).flat();
    }
    getAllEdges(): TypeEdge[] {
        return [
            ...this.getAllIncomingEdges(),
            ...this.getAllOutgoingEdges(),
        ];
    }
}

export function isType(type: unknown): type is Type {
    return typeof type === 'object' && type !== null && typeof (type as Type).getIdentifier === 'function' && isKind((type as Type).kind);
}


export interface TypeStateListener {
    switchedToInvalid(type: Type): void;
    switchedToIdentifiable(type: Type): void;
    switchedToCompleted(type: Type): void;
}
// TODO brauchen wir das überhaupt? stattdessen in TypeReference direkt realisieren?
