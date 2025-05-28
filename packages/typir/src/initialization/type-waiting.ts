/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import type { Type, TypeStateListener } from '../graph/type-node.js';
import { removeFromArray, toArray } from '../utils/utils.js';
import type { TypeReferenceListener, TypeReference } from './type-reference.js';

export interface WaitingForIdentifiableAndCompletedTypeReferencesListener<
    T extends Type,
> {
    onFulfilled(
        waiter: WaitingForIdentifiableAndCompletedTypeReferences<T>,
    ): void;
    onInvalidated(
        waiter: WaitingForIdentifiableAndCompletedTypeReferences<T>,
    ): void;
}

/**
 * The purpose of this class is to inform its listeners, when all given TypeReferences reached their specified initialization state (or a later state).
 * After that, the listeners might be informed multiple times,
 * if at least one of the TypeReferences was unresolved/invalid, but later on all TypeReferences are again in the desired state, and so on.
 */
export class WaitingForIdentifiableAndCompletedTypeReferences<T extends Type>
implements TypeReferenceListener<T>, TypeStateListener
{
    /** Remembers whether all TypeReferences are in the desired states (true) or not (false). */
    protected fulfilled: boolean = false;
    /** This is required for cyclic type definitions:
     * In case of two types A, B which use each other for their properties (e.g. class A {p: B} and class B {p: A}), the case easily occurs,
     * that the types A and B (respectively their WaitingFor... instances) are waiting for each other and therefore waiting for each other.
     * In order to solve these cycles, types which are part of such "dependency cycles" should be ignored during waiting,
     * e.g. A should not waiting B and B should not wait for A.
     * These types to ignore are stored in the following Set.
     */
    protected typesToIgnoreForCycles: Set<Type> = new Set();

    /** These TypeReferences must be in the states Identifiable or Completed, before the listeners are informed */
    protected readonly waitForRefsIdentified:
        | Array<TypeReference<T>>
        | undefined;
    /** These TypeReferences must be in the state Completed, before the listeners are informed */
    protected readonly waitForRefsCompleted:
        | Array<TypeReference<T>>
        | undefined;

    /** These listeners will be informed once, when all TypeReferences are in the desired state.
     * If some of these TypeReferences are invalid (the listeners will not be informed about this) and later in the desired state again,
     * the listeners will be informed again, and so on. */
    protected readonly listeners: Array<
        WaitingForIdentifiableAndCompletedTypeReferencesListener<T>
    > = [];

    constructor(
        waitForRefsToBeIdentified: Array<TypeReference<T>> | undefined,
        waitForRefsToBeCompleted: Array<TypeReference<T>> | undefined,
    ) {
        // remember the relevant TypeReferences to wait for
        this.waitForRefsIdentified = waitForRefsToBeIdentified;
        this.waitForRefsCompleted = waitForRefsToBeCompleted;

        // register to get updates for the relevant TypeReferences
        toArray(this.waitForRefsIdentified).forEach((ref) =>
            ref.addListener(this, true),
        ); // 'true' calls 'checkIfFulfilled()' to check, whether everything might already be fulfilled
        toArray(this.waitForRefsCompleted).forEach((ref) =>
            ref.addListener(this, true),
        );
    }

    deconstruct(): void {
        this.listeners.splice(0, this.listeners.length);
        this.waitForRefsIdentified?.forEach((ref) => ref.removeListener(this));
        this.waitForRefsCompleted?.forEach((ref) => ref.removeListener(this));
        this.typesToIgnoreForCycles.clear();
    }

    addListener(
        newListener: WaitingForIdentifiableAndCompletedTypeReferencesListener<T>,
        informAboutCurrentState: boolean,
    ): void {
        this.listeners.push(newListener);
        // inform the new listener
        if (informAboutCurrentState) {
            if (this.fulfilled) {
                newListener.onFulfilled(this);
            } else {
                newListener.onInvalidated(this);
            }
        }
    }

    removeListener(
        listenerToRemove: WaitingForIdentifiableAndCompletedTypeReferencesListener<T>,
    ): void {
        removeFromArray(listenerToRemove, this.listeners);
    }

    /**
     * This method is called to inform about additional types which can be ignored during the waiting/resolving process.
     * This helps to deal with cycles in type dependencies.
     * @param moreTypesToIgnore might contain duplicates, which are filtered internally
     */
    addTypesToIgnoreForCycles(moreTypesToIgnore: Set<Type>): void {
        // identify the actual new types to ignore (filtering out the types which are already ignored)
        const newTypesToIgnore: Set<Type> = new Set();
        for (const typeToIgnore of moreTypesToIgnore) {
            if (this.typesToIgnoreForCycles.has(typeToIgnore)) {
                // ignore this additional type, required to break the propagation, since the propagation itself becomes cyclic as well in case of cyclic types!
            } else {
                newTypesToIgnore.add(typeToIgnore);
                this.typesToIgnoreForCycles.add(typeToIgnore);
            }
        }

        if (newTypesToIgnore.size <= 0) {
            // no new types to ignore => do nothing
        } else {
            // propagate the new types to ignore recursively to all direct and indirect referenced types ...
            // ... which should be identifiable (or completed)
            for (const ref of this.waitForRefsIdentified ?? []) {
                const refType = ref.getType();
                if (refType?.isInStateOrLater('Identifiable')) {
                    // this reference is already ready
                } else {
                    refType?.ignoreDependingTypesDuringInitialization(
                        newTypesToIgnore,
                    );
                }
            }
            // ... which should be completed
            for (const ref of this.waitForRefsCompleted ?? []) {
                const refType = ref.getType();
                if (refType?.isInStateOrLater('Completed')) {
                    // this reference is already ready
                } else {
                    refType?.ignoreDependingTypesDuringInitialization(
                        newTypesToIgnore,
                    );
                }
            }

            // since there are more types to ignore, check again
            this.checkIfFulfilled();
        }
    }

    onTypeReferenceResolved(
        _reference: TypeReference<T>,
        resolvedType: Type,
    ): void {
        // inform the referenced type about the types to ignore for completion, so that the type could switch to its next phase (if needed)
        resolvedType.ignoreDependingTypesDuringInitialization(
            this.typesToIgnoreForCycles,
        );
        resolvedType.addListener(this, false);
        // check, whether all TypeReferences are resolved and the resolved types are in the expected state
        this.checkIfFulfilled();
        // TODO is a more performant solution possible, e.g. by counting or using "resolvedType"?
    }

    onTypeReferenceInvalidated(
        _reference: TypeReference<T>,
        previousType: Type | undefined,
    ): void {
        // since at least one TypeReference was reset, the listeners might be informed (again), when all TypeReferences reached the desired state (again)
        this.switchToNotFulfilled();
        if (previousType) {
            previousType.removeListener(this);
        }
    }

    onSwitchedToIdentifiable(_type: Type): void {
        // check, whether all TypeReferences are resolved and the resolved types are in the expected state
        this.checkIfFulfilled();
        // TODO is a more performant solution possible, e.g. by counting or using "resolvedType"?
    }
    onSwitchedToCompleted(_type: Type): void {
        // check, whether all TypeReferences are resolved and the resolved types are in the expected state
        this.checkIfFulfilled();
        // TODO is a more performant solution possible, e.g. by counting or using "resolvedType"?
    }
    onSwitchedToInvalid(_type: Type): void {
        // since at least one TypeReference was reset, the listeners might be informed (again), when all TypeReferences reached the desired state (again)
        this.switchToNotFulfilled();
    }

    protected checkIfFulfilled(): void {
        // already informed => do not inform again
        if (this.fulfilled) {
            return;
        }

        for (const ref of toArray(this.waitForRefsIdentified)) {
            const refType = ref.getType();
            if (
                refType &&
                (refType.isInStateOrLater('Identifiable') ||
                    this.typesToIgnoreForCycles.has(refType))
            ) {
                // that is fine
            } else {
                return;
            }
        }
        for (const ref of toArray(this.waitForRefsCompleted)) {
            const refType = ref.getType();
            if (
                refType &&
                (refType.isInStateOrLater('Completed') ||
                    this.typesToIgnoreForCycles.has(refType))
            ) {
                // that is fine
            } else {
                return;
            }
        }

        // everything is fine now! => inform all listeners
        this.fulfilled = true; // don't inform the listeners again
        this.listeners
            .slice()
            .forEach((listener) => listener.onFulfilled(this)); // slice() prevents issues with removal of listeners during notifications
        this.typesToIgnoreForCycles.clear(); // otherwise deleted types remain in this Set forever
    }

    protected switchToNotFulfilled(): void {
        // since at least one TypeReference was reset, the listeners might be informed (again), when all TypeReferences reached the desired state (again)
        if (this.fulfilled) {
            this.fulfilled = false;
            this.listeners
                .slice()
                .forEach((listener) => listener.onInvalidated(this)); // slice() prevents issues with removal of listeners during notifications
        } else {
            // already not fulfilled => nothing to do now
        }
    }

    isFulfilled(): boolean {
        return this.fulfilled;
    }
}

export type WaitingForInvalidTypeReferencesListener<T extends Type> = (
    waiter: WaitingForInvalidTypeReferences<T>,
) => void;

export class WaitingForInvalidTypeReferences<T extends Type>
implements TypeReferenceListener<T>
{
    protected counterInvalid: number; // just count the number of invalid TypeReferences

    // At least one of the given TypeReferences must be in the state Invalid.
    protected readonly waitForRefsInvalid: Array<TypeReference<T>>;

    /** These listeners will be informed, when all TypeReferences are in the desired state. */
    protected readonly listeners: Array<
        WaitingForInvalidTypeReferencesListener<T>
    > = [];

    constructor(waitForRefsToBeInvalid: Array<TypeReference<T>>) {
        // remember the relevant TypeReferences
        this.waitForRefsInvalid = waitForRefsToBeInvalid;
        this.counterInvalid = this.waitForRefsInvalid.filter(
            (ref) =>
                ref.getType() === undefined ||
                ref.getType()!.isInState('Invalid'),
        ).length;

        // register to get updates for the relevant TypeReferences
        this.waitForRefsInvalid.forEach((ref) => ref.addListener(this, false));
    }

    deconstruct(): void {
        this.listeners.splice(0, this.listeners.length);
        this.waitForRefsInvalid.forEach((ref) => ref.removeListener(this));
    }

    addListener(
        newListener: WaitingForInvalidTypeReferencesListener<T>,
        informIfAlreadyFulfilled: boolean,
    ): void {
        this.listeners.push(newListener);
        // inform new listener, if the state is already reached!
        if (informIfAlreadyFulfilled && this.isFulfilled()) {
            newListener(this);
        }
    }

    removeListener(
        listenerToRemove: WaitingForInvalidTypeReferencesListener<T>,
    ): void {
        removeFromArray(listenerToRemove, this.listeners);
    }

    onTypeReferenceResolved(
        _reference: TypeReference<T>,
        _resolvedType: Type,
    ): void {
        this.counterInvalid--;
    }

    onTypeReferenceInvalidated(
        _reference: TypeReference<T>,
        _previousType: Type | undefined,
    ): void {
        this.counterInvalid++;
        if (this.isFulfilled()) {
            this.listeners.slice().forEach((listener) => listener(this));
        }
    }

    isFulfilled(): boolean {
        return (
            this.counterInvalid === this.waitForRefsInvalid.length &&
            this.waitForRefsInvalid.length >= 1
        );
    }

    getWaitForRefsInvalid(): Array<TypeReference<T>> {
        return this.waitForRefsInvalid;
    }
}
