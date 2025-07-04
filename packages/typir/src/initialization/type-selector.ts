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
export type BasicTypeSelector<T extends Type, LanguageType> =
    | T                                 // the wanted type
    | string                            // identifier of the type (to be searched in the type graph/map)
    | TypeInitializer<T, LanguageType>  // delayed creation of types
    | TypeReference<T, LanguageType>    // reference to a (maybe delayed) type
    | LanguageType                      // language node to infer the final type from
    ;

/**
 * This TypeScript type defines the possible ways to identify a desired Typir type.
 */
export type TypeSelector<T extends Type, LanguageType> =
    | BasicTypeSelector<T, LanguageType>          // all base type selectors
    | (() => BasicTypeSelector<T, LanguageType>)  // all type selectors might be given as functions as well, in order to ease delayed specifications
    ;


export interface TypeResolvingService<LanguageType> {
    /**
     * Tries to find the specified type in the type system.
     * This method does not care about the initialization state of the found type,
     * this method is restricted to just search and find any type according to the given TypeSelector.
     * @param selector the specification for the desired type
     * @returns the found type; or undefined, if there is no such type in the type system
     */
    tryToResolve<T extends Type>(selector: TypeSelector<T, LanguageType>): T | undefined;

    /**
     * Finds the specified type in the type system.
     * This method does not care about the initialization state of the found type,
     * this method is restricted to just search and find any type according to the given TypeSelector.
     * @param selector the specification for the desired type
     * @returns the found type; or an exception, if the type cannot be resolved
     */
    resolve<T extends Type>(selector: TypeSelector<T, LanguageType>): T;
}

export class DefaultTypeResolver<LanguageType> implements TypeResolvingService<LanguageType> {
    protected readonly services: TypirServices<LanguageType>;

    constructor(services: TypirServices<LanguageType>) {
        this.services = services;
    }

    tryToResolve<T extends Type>(selector: TypeSelector<T, LanguageType>): T | undefined {
        if (isType(selector)) {
            // TODO is there a way to explicitly enforce/ensure "as T"?
            return selector as T;
        } else if (typeof selector === 'string') {
            return this.services.infrastructure.Graph.getType(selector) as T;
        } else if (selector instanceof TypeInitializer) {
            return selector.getTypeInitial();
        } else if (selector instanceof TypeReference) {
            return selector.getType();
        } else if (typeof selector === 'function') {
            // execute the function and try to recursively resolve the returned result again
            return this.tryToResolve<T>((selector as () => BasicTypeSelector<T, LanguageType>).call(selector));
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

    resolve<T extends Type>(selector: TypeSelector<T, LanguageType>): T {
        if (isType(selector)) {
            return selector as T;
        } else if (typeof selector === 'string') {
            return this.handleError<T>(
                this.services.infrastructure.Graph.getType(selector) as T | undefined,
                `A type with identifier '${selector}' as TypeSelector does not exist in the type graph.`
            );
        } else if (selector instanceof TypeInitializer) {
            return this.handleError(selector.getTypeFinal(), "This TypeInitializer don't provide a type.");
        } else if (selector instanceof TypeReference) {
            return this.handleError(selector.getType(), 'This TypeReference has no resolved type.');
        } else if (typeof selector === 'function') {
            // execute the function and try to recursively resolve the returned result again
            return this.resolve<T>((selector as () => BasicTypeSelector<T, LanguageType>).call(selector));
        } else {
            const result = this.services.Inference.inferType(selector);
            if (isType(result)) {
                return result as T;
            } else {
                throw new Error(`For '${this.services.Printer.printLanguageNode(selector, false)}' as TypeSelector, no type can be inferred.`);
            }
        }
    }

    protected handleError<T extends Type>(result: T | undefined, errorMessage: string): T {
        if (result) {
            return result as T;
        } else {
            throw new Error(errorMessage);
        }
    }
}
