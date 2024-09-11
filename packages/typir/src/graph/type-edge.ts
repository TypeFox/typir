/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type } from './type-node.js';

// TODO make TypeEdge abstract??
export class TypeEdge {
    readonly from: Type;
    readonly to: Type;
    readonly meaning: string; // unique keys to indicate the meaning of this edge
    readonly properties: Map<string, unknown> = new Map(); // store arbitrary data along edges

    constructor(from: Type, to: Type, meaning: string) {
        this.from = from;
        this.to = to;
        this.meaning = meaning;
    }
}
