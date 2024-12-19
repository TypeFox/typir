/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { expect } from 'vitest';
import { Type } from '../graph/type-node.js';
import { TypirServices } from '../typir.js';

/**
 * Testing utility to check, that exactly the expected types are in the type system.
 * @param services the Typir services
 * @param filterTypes used to identify the types of interest
 * @param namesOfExpectedTypes the names (not the identifiers!) of the expected types;
 * ensures that there are no more types;
 * it is possible to specify names multiple times, if there are multiple types with the same name (e.g. for overloaded functions)
 * @returns all the found types
 */
export function expectTypirTypes(services: TypirServices, filterTypes: (type: Type) => boolean, ...namesOfExpectedTypes: string[]): Type[] {
    const types = services.infrastructure.Graph.getAllRegisteredTypes().filter(filterTypes);
    types.forEach(type => expect(type.getInitializationState()).toBe('Completed')); // check that all types are 'Completed'
    const typeNames = types.map(t => t.getName());
    expect(typeNames, typeNames.join(', ')).toHaveLength(namesOfExpectedTypes.length);
    for (const name of namesOfExpectedTypes) {
        const index = typeNames.indexOf(name);
        expect(index >= 0).toBeTruthy();
        typeNames.splice(index, 1); // removing elements is needed to work correctly with duplicated entries
    }
    expect(typeNames, `There are more types than expected: ${typeNames.join(', ')}`).toHaveLength(0);
    return types;
}
