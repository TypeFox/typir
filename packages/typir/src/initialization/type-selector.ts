/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { isType, Type } from '../graph/type-node.js';
import { TypirServices } from '../typir.js';
import { TypeInitializer } from './type-initializer.js';
import { TypeReference } from './type-reference.js';

// TODO find better names: TypeSpecification, TypeDesignation/Designator, ... ?
export type BasicTypeSelector =
    | Type              // the instance of the wanted type
    | string            // identifier of the type (in the type graph/map)
    | TypeInitializer   // delayed creation of types
    | TypeReference     // reference to a (maybe delayed) type
    | unknown           // domain node to infer the final type from
    ;

/**
 * This TypeScript type defines the possible ways to identify a desired Typir type.
 */
export type TypeSelector =
    | BasicTypeSelector             // all base type selectors
    | (() => BasicTypeSelector)    // all type selectors might be given as functions as well, in order to ease delayed specifications
    ;


export interface TypeResolvingService {
    /**
     * Tries to find the specified type in the type system.
     * This method does not care about the initialization state of the found type,
     * this method is restricted to just search and find any type according to the given TypeSelector.
     * @param selector the specification for the desired type
     * @returns the found type or undefined, it there is no such type in the type system
     */
    tryToResolve<T extends Type = Type>(selector: TypeSelector): T | undefined;

    /**
     * Finds the specified type in the type system.
     * This method does not care about the initialization state of the found type,
     * this method is restricted to just search and find any type according to the given TypeSelector.
     * @param selector the specification for the desired type
     * @returns the found type; or an exception, if the type cannot be resolved
     */
    resolve<T extends Type = Type>(selector: TypeSelector): T;
}

export class DefaultTypeResolver implements TypeResolvingService {
    protected readonly services: TypirServices;

    constructor(services: TypirServices) {
        this.services = services;
    }

    tryToResolve<T extends Type = Type>(selector: TypeSelector): T | undefined {
        if (isType(selector)) {
            // TODO is there a way to explicitly enforce/ensure "as T"?
            return selector as T;
        } else if (typeof selector === 'string') {
            return this.services.Graph.getType(selector) as T;
        } else if (selector instanceof TypeInitializer) {
            return selector.getTypeInitial();
        } else if (selector instanceof TypeReference) {
            return selector.getType();
        } else if (typeof selector === 'function') {
            return this.tryToResolve(selector()); // execute the function and try to recursively resolve the returned result again
        } else { // the selector is of type 'known' => do type inference on it
            const result = this.services.Inference.inferType(selector);
            // TODO failures must not be cached, otherwise a type will never be found in the future!!
            if (isType(result)) {
                return result as T;
            } else {
                return undefined;
            }
        }
    }

    resolve<T extends Type = Type>(selector: TypeSelector): T {
        if (isType(selector)) {
            return selector as T;
        } else if (typeof selector === 'string') {
            const result = this.services.Graph.getType(selector);
            if (result) {
                return result as T;
            } else {
                throw new Error(`A type with identifier '${selector}' as TypeSelector does not exist in the type graph.`);
            }
        } else if (selector instanceof TypeInitializer) {
            return selector.getTypeFinal();
        } else if (selector instanceof TypeReference) {
            return selector.getType();
        } else if (typeof selector === 'function') {
            return this.resolve(selector()); // execute the function and try to recursively resolve the returned result again
        } else {
            const result = this.services.Inference.inferType(selector);
            if (isType(result)) {
                return result as T;
            } else {
                throw new Error(`For '${this.services.Printer.printDomainElement(selector, false)}' as TypeSelector, no type can be inferred.`);
            }
        }
    }
}
