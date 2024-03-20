/* eslint-disable header/header */

import { Type } from './type-node';

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
