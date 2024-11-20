/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { expect } from 'vitest';
import { Type } from '../graph/type-node.js';
import { TypirServices } from '../typir.js';

export function expectTypirTypes(services: TypirServices, filterTypes: (type: Type) => boolean, ...namesOfExpectedTypes: string[]): void {
    const typeNames = services.graph.getAllRegisteredTypes().filter(filterTypes).map(t => t.getName());
    expect(typeNames, typeNames.join(', ')).toHaveLength(namesOfExpectedTypes.length);
    for (const name of namesOfExpectedTypes) {
        expect(typeNames).includes(name);
    }
}
