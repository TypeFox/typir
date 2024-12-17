/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Class } from './generated/ast.js';

export function getClassChain(classItem: Class): Class[] {
    const set = new Set<Class>();
    let value: Class | undefined = classItem;
    while (value && !set.has(value)) {
        set.add(value);
        value = value.superClass?.ref;
    }
    // Sets preserve insertion order
    return Array.from(set);
}
