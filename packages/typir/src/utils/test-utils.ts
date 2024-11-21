/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { expect } from 'vitest';
import { Type } from '../graph/type-node.js';
import { TypirServices } from '../typir.js';

export function expectTypirTypes(services: TypirServices, filterTypes: (type: Type) => boolean, ...namesOfExpectedTypes: string[]): Type[] {
    const types = services.graph.getAllRegisteredTypes().filter(filterTypes);
    types.forEach(type => expect(type.getInitializationState()).toBe('Completed')); // check that all types are 'Completed'
    const typeNames = types.map(t => t.getName());
    expect(typeNames, typeNames.join(', ')).toHaveLength(namesOfExpectedTypes.length);
    for (const name of namesOfExpectedTypes) {
        const index = typeNames.indexOf(name);
        expect(index >= 0).toBeTruthy();
        typeNames.splice(index, 1); // removing elements is needed to work correctly with duplicated entries
    }
    expect(typeNames).toHaveLength(0);
    return types;
}
