/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type } from '../graph/type-node.js';
import { TypirServices } from '../typir.js';

export type TypeInitializerListener<T extends Type = Type> = (type: T) => void;

export abstract class TypeInitializer<T extends Type = Type> {
    protected readonly services: TypirServices;
    protected typeToReturn: T | undefined;
    protected listeners: Array<TypeInitializerListener<T>> = [];

    constructor(services: TypirServices) {
        this.services = services;
    }

    protected producedType(newType: T): T {
        const key = newType.getIdentifier();
        if (!key) {
            throw new Error('missing identifier!');
        }
        const existingType = this.services.graph.getType(key);
        if (existingType) {
            // ensure, that the same type is not duplicated!
            this.typeToReturn = existingType as T;
            // TODO: newType.invalidate()
        } else {
            this.typeToReturn = newType;
            this.services.graph.addNode(newType);
        }

        // inform and clear all listeners
        this.listeners.slice().forEach(listener => listener(this.typeToReturn!));
        this.listeners = [];
        return this.typeToReturn;
    }

    getType(): T | undefined {
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
