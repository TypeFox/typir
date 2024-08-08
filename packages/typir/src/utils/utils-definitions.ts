/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { AssignabilityProblem } from '../features/assignability.js';
import { TypeEqualityProblem } from '../features/equality.js';
import { InferenceProblem } from '../features/inference.js';
import { SubTypeProblem } from '../features/subtype.js';
import { ValidationProblem } from '../features/validation.js';
import { isType, Type } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { ValueConflict, IndexedTypeConflict } from './utils-type-comparison.js';

export type TypirProblem = ValueConflict | IndexedTypeConflict | AssignabilityProblem | SubTypeProblem | TypeEqualityProblem | InferenceProblem | ValidationProblem;

export type Types = Type | Type[];
export type Names = string | string[];

export type NameTypePair = {
    name: string;
    type: Type;
}

// TODO this is a WIP sketch for managing the use of Types in properties/details of other Types (e.g. Types of fields of class Types)
export interface TypeReference<T extends Type = Type> {
    readonly ref?: T;
    readonly selector?: TypeSelector;
    readonly error?: TypirProblem;
}

// This TypeScript type defines the possible ways to identify a wanted Typir type.
// TODO find better names
export type TypeSelector =
    | Type      // the instance of the wanted type
    | string    // identifier of the type (in the type graph/map)
    | unknown   // domain node to infer the final type from
    ;
// TODO this is a sketch for delaying the type selection in the future
export type DelayedTypeSelector = TypeSelector | (() => TypeSelector);

export function resolveTypeSelector(typir: Typir, selector: TypeSelector): Type {
    /** TODO this is only a rough sketch:
     * - detect cycles/deadlocks during the resolving process
     * - make the resolving strategy exchangable
     * - integrate it into TypeReference implementation?
     */
    if (isType(selector)) {
        return selector;
    } else if (typeof selector === 'string') {
        const result = typir.graph.getType(selector);
        if (result) {
            return result;
        } else {
            throw new Error('TODO not-found problem');
        }
    } else {
        const result = typir.inference.inferType(selector);
        if (isType(result)) {
            return result;
        } else {
            throw new Error('TODO handle inference problem for ' + typir.printer.printDomainElement(selector, false));
        }
    }
}
