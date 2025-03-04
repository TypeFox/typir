/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type } from '../graph/type-node.js';
import { TypirServices } from '../typir.js';

export type TypeInitializerListener<T extends Type = Type> = (type: T) => void;

/**
 * The purpose of a TypeInitializer is to ensure, that the same type is created and registered only _once_ in the type system.
 * This class is used during the use case, when a type declaration in the AST exists,
 * for which a corresponding new Typir type needs to be established in the type system ("create new type").
 *
 * Without checking for duplicates, the same type might be created twice, e.g. in the following scenario:
 * If the creation of A is delayed, since a type B which is required for some properties of A is not yet created, A will be created not now, but later.
 * During the "waiting time" for B, another declaration in the AST might be found with the same Typir type A.
 * (The second declaration might be wrong, but the user expects to get a validation hint, and not Typir to crash, or the current DSL might allow duplicated type declarations.)
 * Since the first Typir type is not yet in the type systems (since it still waits for B) and therefore remains unknown,
 * it will be tried to create A a second time, again delayed, since B is still not yet available.
 * When B is created, A is waiting twice and might be created twice, if no TypeInitializer is used.
 *
 * Design decision: While this class does not provide so many default implementations,
 * a common super class (or interface) of all type initializers is useful nevertheless,
 * since they all can be used as TypeSelector in an easy way.
 */
export abstract class TypeInitializer<T extends Type = Type, LanguageType = unknown> {
    protected readonly services: TypirServices<LanguageType>;
    protected typeToReturn: T | undefined;
    protected listeners: Array<TypeInitializerListener<T>> = [];

    constructor(services: TypirServices<LanguageType>) {
        this.services = services;
    }

    protected producedType(newType: T): T {
        const key = newType.getIdentifier();
        if (!key) {
            throw new Error('missing identifier!');
        }
        const existingType = this.services.infrastructure.Graph.getType(key);
        if (existingType) {
            // ensure, that the same type is not duplicated!
            this.typeToReturn = existingType as T;
            newType.dispose();
        } else {
            this.typeToReturn = newType;
            this.services.infrastructure.Graph.addNode(this.typeToReturn);
        }

        // inform and clear all listeners
        this.listeners.slice().forEach(listener => listener(this.typeToReturn!));
        this.listeners = []; // clear the list of listeners, since they will not be informed again

        // return the created/identified type
        return this.typeToReturn;
    }

    // TODO using this type feels wrong, but without this approach, it seems not to work ...
    abstract getTypeInitial(): T

    getTypeFinal(): T | undefined {
        return this.typeToReturn;
    }

    addListener(listener: TypeInitializerListener<T>): void {
        if (this.typeToReturn) {
            // already resolved => call the listener directly
            listener(this.typeToReturn);
        } else {
            this.listeners.push(listener);
        }
    }
}
