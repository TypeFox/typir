/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

/* eslint-disable @typescript-eslint/no-explicit-any */

import { TypeInferenceCollectorListener, TypeInferenceRule } from '../features/inference.js';
import { TypeEdge } from '../graph/type-edge.js';
import { TypeGraphListener } from '../graph/type-graph.js';
import { isType, Type, TypeInitializationState, TypeStateListener } from '../graph/type-node.js';
import { TypirServices } from '../typir.js';
import { TypeInitializer } from './type-initialization.js';
import { toArray } from './utils.js';

/**
 * Common interface of all problems/errors/messages which should be shown to users of DSLs which are type-checked with Typir.
 * This approach makes it easier to introduce additional errors by users of Typir, compared to a union type, e.g. export type TypirProblem = ValueConflict | IndexedTypeConflict | ...
 */
export interface TypirProblem {
    readonly $problem: string;
}
export function isSpecificTypirProblem(problem: unknown, $problem: string): problem is TypirProblem {
    return typeof problem === 'object' && problem !== null && ((problem as TypirProblem).$problem === $problem);
}

export type Types = Type | Type[];
export type Names = string | string[];

export type NameTypePair = {
    name: string;
    type: Type;
}
export function isNameTypePair(type: unknown): type is NameTypePair {
    return typeof type === 'object' && type !== null && typeof (type as NameTypePair).name === 'string' && isType((type as NameTypePair).type);
}



// This TypeScript type defines the possible ways to identify a wanted Typir type.
// TODO find better names: TypeSpecification, TypeDesignation/Designator, ... ?
export type TypeSelector =
    | Type              // the instance of the wanted type
    | string            // identifier of the type (in the type graph/map)
    | TypeInitializer   // delayed creation of types
    | TypeReference     // reference to a (maybe delayed) type
    | unknown           // domain node to infer the final type from
    ;
export type DelayedTypeSelector = TypeSelector | (() => TypeSelector);


export type WaitingForResolvedTypeReferencesListener<T extends Type = Type> = (waiter: WaitingForIdentifiableAndCompletedTypeReferences<T>) => void;

/**
 * The purpose of this class is to inform its listeners, when all given TypeReferences reached their specified initialization state (or a later state).
 * After that, the listeners might be informed multiple times,
 * if at least one of the TypeReferences was unresolved/invalid, but later on all TypeReferences are again in the desired state, and so on.
 */
export class WaitingForIdentifiableAndCompletedTypeReferences<T extends Type = Type> {
    /** Remembers whether all TypeReferences are in the desired states (true) or not (false). */
    protected fulfilled: boolean = false;
    /** This is required for cyclic type definitions:
     * In case of two types A, B which use each other for their properties (e.g. class A {p: B} and class B {p: A}), the case easily occurs,
     * that the types A and B (respectively their WaitingFor... instances) are waiting for each other and therefore waiting for each other.
     * In order to solve these cycles, types which are part of such "dependency cycles" should be ignored during waiting,
     * e.g. A should not waiting B and B should not wait for A.
     * These types to ignore are stored in the following Set.
     */
    protected typesForCycles: Set<Type> = new Set();

    /** These TypeReferences must be in the states Identifiable or Completed, before the listeners are informed */
    protected readonly waitForRefsIdentified: Array<TypeReference<T>> | undefined;
    /** These TypeReferences must be in the state Completed, before the listeners are informed */
    protected readonly waitForRefsCompleted: Array<TypeReference<T>> | undefined;

    private readonly reactOnNextIdentified: TypeReferenceListener<T> = (reference: TypeReference<T>, resolvedType: T) => this.listeningForNextIdentified(reference, resolvedType);
    private readonly reactOnNextCompleted: TypeReferenceListener<T> = (reference: TypeReference<T>, resolvedType: T) => this.listeningForNextCompleted(reference, resolvedType);
    private readonly reactOnResetState: TypeReferenceListener<T> = (_reference: TypeReference<T>, _resolvedType: T) => this.listeningForReset();

    /** These listeners will be informed once, when all TypeReferences are in the desired state.
     * If some of these TypeReferences are invalid (the listeners will not be informed about this) and later in the desired state again,
     * the listeners will be informed again, and so on. */
    protected readonly listeners: Array<WaitingForResolvedTypeReferencesListener<T>> = [];

    constructor(
        waitForRefsToBeIdentified: Array<TypeReference<T>> | undefined,
        waitForRefsToBeCompleted: Array<TypeReference<T>> | undefined,
        typeCycle: Type | undefined,
    ) {

        // remember the relevant TypeReferences to wait for
        this.waitForRefsIdentified = waitForRefsToBeIdentified;
        this.waitForRefsCompleted = waitForRefsToBeCompleted;

        // set-up the set of types to not wait for them, in order to handle cycles
        if (typeCycle) {
            this.typesForCycles.add(typeCycle);
        }

        // register to get updates for the relevant TypeReferences
        toArray(this.waitForRefsIdentified).forEach(ref => {
            ref.addReactionOnTypeIdentified(this.reactOnNextIdentified, false);
            ref.addReactionOnTypeUnresolved(this.reactOnResetState, false);
        });
        toArray(this.waitForRefsCompleted).forEach(ref => {
            ref.addReactionOnTypeIdentified(this.reactOnNextIdentified, false);
            ref.addReactionOnTypeCompleted(this.reactOnNextCompleted, false);
            ref.addReactionOnTypeUnresolved(this.reactOnResetState, false);
        });

        // everything might already be fulfilled
        this.check();
    }

    addListener(newListener: WaitingForResolvedTypeReferencesListener<T>, informIfAlreadyFulfilled: boolean): void {
        this.listeners.push(newListener);
        // inform the new listener, if the state is already reached!
        if (informIfAlreadyFulfilled && this.fulfilled) {
            newListener(this);
        }
    }

    removeListener(listenerToRemove: WaitingForResolvedTypeReferencesListener<T>): void {
        const index = this.listeners.indexOf(listenerToRemove);
        if (index >= 0) {
            this.listeners.splice(index, 1);
        }
    }

    addTypesToIgnoreForCycles(moreTypesToIgnore: Set<Type>): void {
        // identify the actual new types to ignore (filtering out the types which are already ignored)
        const newTypesToIgnore: Set<Type> = new Set();
        for (const typeToIgnore of moreTypesToIgnore) {
            if (this.typesForCycles.has(typeToIgnore)) {
                // ignore this additional type, required to break the propagation, since the propagation becomes cyclic as well in case of cyclic types!
            } else {
                newTypesToIgnore.add(typeToIgnore);
                this.typesForCycles.add(typeToIgnore);
            }
        }

        if (newTypesToIgnore.size <= 0) {
            // no new types to ignore => do nothing
        } else {
            // propagate the new types to ignore recursively to all direct and indirect referenced types ...
            // ... which should be identifiable (or completed)
            for (const ref of (this.waitForRefsIdentified ?? [])) {
                const refType = ref.getType();
                if (refType?.isInStateOrLater('Identifiable')) {
                    // this reference is already ready
                } else {
                    refType?.ignoreDependingTypesDuringInitialization(newTypesToIgnore);
                }
            }
            // ... which should be completed
            for (const ref of (this.waitForRefsCompleted ?? [])) {
                const refType = ref.getType();
                if (refType?.isInStateOrLater('Completed')) {
                    // this reference is already ready
                } else {
                    refType?.ignoreDependingTypesDuringInitialization(newTypesToIgnore);
                }
            }

            // since there are more types to ignore, check again
            this.check();
        }
    }

    protected listeningForNextIdentified(_reference: TypeReference<T>, resolvedType: T): void {
        // inform the referenced type about the types to ignore for completion
        resolvedType.ignoreDependingTypesDuringInitialization(this.typesForCycles);
        // check, whether all TypeReferences are resolved and the resolved types are in the expected state
        this.check();
        // TODO is a more performant solution possible, e.g. by counting or using "resolvedType"?
    }

    protected listeningForNextCompleted(_reference: TypeReference<T>, _resolvedType: T): void {
        // check, whether all TypeReferences are resolved and the resolved types are in the expected state
        this.check();
        // TODO is a more performant solution possible, e.g. by counting or using "resolvedType"?
    }

    protected listeningForReset(): void {
        // since at least one TypeReference was reset, the listeners might be informed (again), when all TypeReferences reached the desired state (again)
        this.fulfilled = false;
        // the listeners are not informed about this invalidation; TODO might that help to get rid of WaitingForInvalidTypeReferences ??
    }

    protected check() {
        // already informed => do not inform again
        if (this.fulfilled) {
            return;
        }

        for (const ref of toArray(this.waitForRefsIdentified)) {
            const refType = ref.getType();
            if (refType && (refType.isInStateOrLater('Identifiable') || this.typesForCycles.has(refType))) {
                // that is fine
            } else {
                return;
            }
        }
        for (const ref of toArray(this.waitForRefsCompleted)) {
            const refType = ref.getType();
            if (refType && (refType.isInStateOrLater('Completed') || this.typesForCycles.has(refType))) {
                // that is fine
            } else {
                return;
            }
        }

        // everything is fine now! => inform all listeners
        this.fulfilled = true; // don't inform the listeners again
        this.listeners.slice().forEach(listener => listener(this)); // slice() prevents issues with removal of listeners during notifications
    }

    isFulfilled(): boolean {
        return this.fulfilled;
    }
}

export type WaitingForInvalidTypeReferencesListener<T extends Type = Type> = (waiter: WaitingForInvalidTypeReferences<T>) => void;

export class WaitingForInvalidTypeReferences<T extends Type = Type> {
    protected counterInvalid: number; // just count the number of invalid TypeReferences

    // At least one of the given TypeReferences must be in the state Invalid.
    protected readonly waitForRefsInvalid: Array<TypeReference<T>>;

    /** These listeners will be informed, when all TypeReferences are in the desired state. */
    protected readonly listeners: Array<WaitingForInvalidTypeReferencesListener<T>> = [];

    constructor(
        waitForRefsToBeInvalid: Array<TypeReference<T>>,
    ) {

        // remember the relevant TypeReferences
        this.waitForRefsInvalid = waitForRefsToBeInvalid;
        this.counterInvalid = this.waitForRefsInvalid.filter(ref => ref.isInState('Invalid')).length;

        // register to get updates for the relevant TypeReferences
        this.waitForRefsInvalid.forEach(ref => {
            ref.addReactionOnTypeIdentified(() => this.listeningForNextState(), false);
            ref.addReactionOnTypeUnresolved(() => this.listeningForReset(), false);
        });
    }

    addListener(newListener: WaitingForInvalidTypeReferencesListener<T>, informIfAlreadyFulfilled: boolean): void {
        this.listeners.push(newListener);
        // inform new listener, if the state is already reached!
        if (informIfAlreadyFulfilled && this.isFulfilled()) {
            newListener(this);
        }
    }

    removeListener(listenerToRemove: WaitingForInvalidTypeReferencesListener<T>): void {
        const index = this.listeners.indexOf(listenerToRemove);
        if (index >= 0) {
            this.listeners.splice(index, 1);
        }
    }

    protected listeningForNextState(): void {
        this.counterInvalid--;
    }

    protected listeningForReset(): void {
        this.counterInvalid++;
        if (this.isFulfilled()) {
            this.listeners.slice().forEach(listener => listener(this));
        }
    }

    isFulfilled(): boolean {
        return this.counterInvalid === this.waitForRefsInvalid.length && this.waitForRefsInvalid.length >= 1;
    }
}



/**
 * A listener for TypeReferences, who will be informed about the found/identified/resolved/unresolved type of the current TypeReference.
 */
export type TypeReferenceListener<T extends Type = Type> = (reference: TypeReference<T>, resolvedType: T) => void;

/**
 * A TypeReference accepts a specification for a type and searches for the corresponding type in the type system according to this specification.
 * Different TypeReferences might resolve to the same Type.
 * This class is used during the use case, when a Typir type uses other types for its properties,
 * e.g. class types use other types from the type system for describing the types of its fields ("use existing type").
 *
 * The internal logic of a TypeReference is independent from the kind of the type to resolve.
 * A TypeReference takes care of the lifecycle of the types.
 *
 * Once the type is resolved, listeners are notified about this and all following changes of its state.
 */
export class TypeReference<T extends Type = Type> implements TypeGraphListener, TypeStateListener, TypeInferenceCollectorListener {
    protected readonly selector: TypeSelector;
    protected readonly services: TypirServices;
    protected resolvedType: T | undefined = undefined;

    /* TODO Review zur Architektur (also zu "implements TypeStateListener"):
    Alternativ könnte der Initialization-State komplett aus TypeReference rausgenommen werden und nur resolved/unresolved betrachtet werden?
    Das würde die TypeReference vereinfachen und würde nicht zwei Sachen unnötigerweise vermengen.
    Andererseits würde die Logik/Komplexität vielleicht auch nur woanders hinverschoben.
    */

    /** These listeners will be informed, whenever the type of this TypeReference was unresolved/unknown and it is known/resolved now.
     * If the resolved type is already 'Completed', these listeners will be informed as well. */
    protected readonly reactOnIdentified: Array<TypeReferenceListener<T>> = [];
    /** These listeners will be informed, whenever the state type of this TypeReference is 'Completed' now,
     * since it was unresolved or identifiable before. */
    protected readonly reactOnCompleted: Array<TypeReferenceListener<T>> = [];
    /** These listeners will be informed, whenever the state type of this TypeReference is invalid or unresolved now,
     * since it was identifiable or completed before. */
    protected readonly reactOnUnresolved: Array<TypeReferenceListener<T>> = [];

    // TODO introduce TypeReference factory service in order to replace the implementation?
    constructor(selector: TypeSelector, services: TypirServices) {
        this.selector = selector;
        this.services = services;

        this.startResolving();
    }

    protected startResolving(): void {
        // discard the previously resolved type (if any)
        this.resolvedType = undefined;

        // react on new types
        this.services.graph.addListener(this);
        // react on new inference rules
        this.services.inference.addListener(this);
        // don't react on state changes of already existing types which are not (yet) completed, since TypeSelectors don't care about the initialization state of types

        // try to resolve now
        this.resolve();
    }

    protected stopResolving(): void {
        // it is not required to listen to new types anymore, since the type is already resolved/found
        this.services.graph.removeListener(this);
        this.services.inference.removeListener(this);
    }

    getState(): TypeInitializationState | undefined {
        if (this.resolvedType) {
            return this.resolvedType.getInitializationState();
        } else {
            return undefined;
        }
    }

    isInState(state: TypeInitializationState): boolean {
        if (state === 'Invalid' && this.resolvedType === undefined) {
            return true;
        }
        return this.resolvedType !== undefined && this.resolvedType.isInState(state); // resolved type is in the given state
    }
    isNotInState(state: TypeInitializationState): boolean {
        return !this.isInState(state);
    }
    isInStateOrLater(state: TypeInitializationState): boolean {
        switch (state) {
            case 'Invalid':
                return true;
            default:
                return this.resolvedType !== undefined && this.resolvedType.isInStateOrLater(state);
        }
    }

    getType(): T | undefined {
        return this.resolvedType;
    }

    /**
     * Resolves the referenced type, if the type is not yet resolved.
     * Note that the resolved type might not be completed yet.
     * @returns the result of the currently executed resolution
     */
    protected resolve(): 'ALREADY_RESOLVED' | 'SUCCESSFULLY_RESOLVED' | 'RESOLVING_FAILED' {
        if (this.resolvedType) {
            // the type is already resolved => nothing to do
            return 'ALREADY_RESOLVED';
        }

        // try to resolve the type
        const resolvedType = this.tryToResolve(this.selector);

        if (resolvedType) {
            // the type is successfully resolved!
            this.resolvedType = resolvedType;
            this.stopResolving();
            // notify observers
            if (this.isInStateOrLater('Identifiable')) {
                this.reactOnIdentified.slice().forEach(listener => listener(this, resolvedType));
            }
            if (this.isInStateOrLater('Completed')) {
                this.reactOnCompleted.slice().forEach(listener => listener(this, resolvedType));
            } else {
                // register to get updates for the resolved type in order to notify the observers of this TypeReference about the missing "identifiable" and "completed" cases above
                resolvedType.addListener(this, false);
            }
            return 'SUCCESSFULLY_RESOLVED';
        } else {
            // the type is not resolved (yet)
            return 'RESOLVING_FAILED';
        }
    }

    /**
     * Tries to find the specified type in the type system.
     * This method does not care about the initialization state of the found type,
     * this method is restricted to just search and find any type according to the given TypeSelector.
     * @param selector the specification for the desired type
     * @returns the found type or undefined, it there is no such type in the type system
     */
    protected tryToResolve(selector: TypeSelector): T | undefined {
        if (isType(selector)) {
            // TODO is there a way to explicitly enforce/ensure "as T"?
            return selector as T;
        } else if (typeof selector === 'string') {
            return this.services.graph.getType(selector) as T;
        } else if (selector instanceof TypeInitializer) {
            return selector.getType();
        } else if (selector instanceof TypeReference) {
            return selector.getType();
        } else if (typeof selector === 'function') {
            return this.tryToResolve(selector()); // execute the function and try to recursively resolve the returned result again
        } else { // the selector is of type 'known' => do type inference on it
            const result = this.services.inference.inferType(selector);
            // TODO failures must not be cached, otherwise a type will never be found in the future!!
            if (isType(result)) {
                return result as T;
            } else {
                return undefined;
            }
        }
    }

    addReactionOnTypeIdentified(listener: TypeReferenceListener<T>, informIfAlreadyIdentified: boolean): void {
        this.reactOnIdentified.push(listener);
        if (informIfAlreadyIdentified && this.isInStateOrLater('Identifiable')) {
            listener(this, this.resolvedType!);
        }
    }
    addReactionOnTypeCompleted(listener: TypeReferenceListener<T>, informIfAlreadyCompleted: boolean): void {
        this.reactOnCompleted.push(listener);
        if (informIfAlreadyCompleted && this.isInStateOrLater('Completed')) {
            listener(this, this.resolvedType!);
        }
    }
    addReactionOnTypeUnresolved(listener: TypeReferenceListener<T>, informIfInvalid: boolean): void {
        this.reactOnUnresolved.push(listener);
        if (informIfInvalid && this.isInState('Invalid')) {
            listener(this, this.resolvedType!);
        }
    }

    removeReactionOnTypeIdentified(listener: TypeReferenceListener<T>): void {
        const index = this.reactOnIdentified.indexOf(listener);
        if (index >= 0) {
            this.reactOnIdentified.splice(index, 1);
        }
    }
    removeReactionOnTypeCompleted(listener: TypeReferenceListener<T>): void {
        const index = this.reactOnCompleted.indexOf(listener);
        if (index >= 0) {
            this.reactOnCompleted.splice(index, 1);
        }
    }
    removeReactionOnTypeUnresolved(listener: TypeReferenceListener<T>): void {
        const index = this.reactOnUnresolved.indexOf(listener);
        if (index >= 0) {
            this.reactOnUnresolved.splice(index, 1);
        }
    }


    addedType(_addedType: Type, _key: string): void {
        // after adding a new type, try to resolve the type
        this.resolve(); // possible performance optimization: is it possible to do this more performant by looking at the "addedType"?
    }

    removedType(removedType: Type, _key: string): void {
        // the resolved type of this TypeReference is removed!
        if (removedType === this.resolvedType) {
            // notify observers, that the type reference is broken
            this.reactOnUnresolved.slice().forEach(listener => listener(this, this.resolvedType!));
            // start resolving the type again
            this.startResolving();
        }
    }

    addedEdge(_edge: TypeEdge): void {
        // only types are relevant
    }
    removedEdge(_edge: TypeEdge): void {
        // only types are relevant
    }

    addedInferenceRule(_rule: TypeInferenceRule, _boundToType?: Type): void {
        // after adding a new inference rule, try to resolve the type
        this.resolve(); // possible performance optimization: use only the new inference rule to resolve the type
    }
    removedInferenceRule(_rule: TypeInferenceRule, _boundToType?: Type): void {
        // empty, since removed inference rules don't help to resolve a type
    }

    switchedToIdentifiable(type: Type): void {
        if (type === this.resolvedType) {
            // the type was already resolved, but some observers of this TypeReference still need to be informed
            this.reactOnIdentified.slice().forEach(listener => listener(this, this.resolvedType!)); // slice() prevents issues with removal of listeners during notifications
        } else {
            throw new Error('This case should not happen, since this TypeReference is registered only for the resolved type.');
        }
    }

    switchedToCompleted(type: Type): void {
        if (type === this.resolvedType) {
            // the type was already resolved, but some observers of this TypeReference still need to be informed
            this.reactOnCompleted.slice().forEach(listener => listener(this, this.resolvedType!)); // slice() prevents issues with removal of listeners during notifications
            type.removeListener(this); // all listeners are informed now, therefore no more notifications are needed
        } else {
            throw new Error('This case should not happen, since this TypeReference is registered only for the resolved type.');
        }
    }

    switchedToInvalid(type: Type): void {
        type.removeListener(this);
    }
}


export function resolveTypeSelector(services: TypirServices, selector: TypeSelector): Type {
    if (isType(selector)) {
        return selector;
    } else if (typeof selector === 'string') {
        const result = services.graph.getType(selector);
        if (result) {
            return result;
        } else {
            throw new Error(`A type with identifier '${selector}' as TypeSelector does not exist in the type graph.`);
        }
    } else if (selector instanceof TypeInitializer) {
        return selector.getType();
    } else if (selector instanceof TypeReference) {
        return selector.getType();
    } else if (typeof selector === 'function') {
        return resolveTypeSelector(services, selector()); // execute the function and try to recursively resolve the returned result again
    } else {
        const result = services.inference.inferType(selector);
        if (isType(result)) {
            return result;
        } else {
            throw new Error(`For '${services.printer.printDomainElement(selector, false)}' as TypeSelector, no type can be inferred.`);
        }
    }
}
