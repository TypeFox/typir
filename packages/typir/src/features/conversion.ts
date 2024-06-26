/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeEdge } from '../graph/type-edge.js';
import { Type } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { toArray } from '../utils/utils.js';

export type ConversionMode =
    'IMPLICIT' | // coercion
    'EXPLICIT' | // casting
    'BOTH'; // TODO does this make sense? Does IMPLICIT => EXPLICIT hold?

export interface TypeConversion {
    markAsConvertible(from: Type | Type[], to: Type | Type[], mode: ConversionMode): void
    isConvertibleTo(from: Type, to: Type, mode: ConversionMode): boolean;
}

export class DefaultTypeConversion implements TypeConversion {
    protected readonly typir: Typir;

    constructor(typir: Typir) {
        this.typir = typir;
    }

    markAsConvertible(from: Type | Type[], to: Type | Type[], mode: ConversionMode): void {
        const allFrom = toArray(from);
        const allTo = toArray(to);
        for (const f of allFrom) {
            for (const t of allTo) {
                this.markAsConvertibleSingle(f, t, mode);
            }
        }
    }
    protected markAsConvertibleSingle(from: Type, to: Type, mode: ConversionMode): void {
        let edge = this.getEdge(from, to);
        if (!edge) {
            edge = new TypeEdge(from, to, TYPE_CONVERSION);
            this.typir.graph.addEdge(edge);
        }
        edge.properties.set(TYPE_CONVERSION_MODE, mode);
    }

    isConvertibleTo(from: Type, to: Type, mode: ConversionMode): boolean {
        const edge = this.getEdge(from, to);
        if (edge) {
            const current = edge.properties.get(TYPE_CONVERSION_MODE) as ConversionMode;
            return current === mode || current === 'BOTH';
        }
        return false;
    }

    protected getEdge(from: Type, to: Type): TypeEdge | undefined {
        return from.getOutgoingEdges(TYPE_CONVERSION).find(edge => edge.to === to);
    }
}

const TYPE_CONVERSION = 'isConvertibleTo';
const TYPE_CONVERSION_MODE = 'mode';
