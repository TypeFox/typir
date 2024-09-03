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
    'NONE' |     // no conversion possible at all
    'SELF';      // a type is always self-convertible to itself

export interface TypeConversion {
    markAsConvertible(from: Type | Type[], to: Type | Type[], mode: ConversionMode): void
    getConversion(from: Type, to: Type): ConversionMode;
    isConvertible(from: Type, to: Type, mode: ConversionMode): boolean;
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
        const storeNothing = mode === 'NONE' || mode === 'SELF';
        let edge = this.getEdge(from, to);
        if (storeNothing) {
            if (edge) {
                // remove an existing edge
                this.typir.graph.removeEdge(edge);
            } else {
                // nothing to do
            }
        } else {
            if (!edge) {
                // create a missing edge
                edge = new TypeEdge(from, to, TYPE_CONVERSION);
                this.typir.graph.addEdge(edge);
            }
            edge.properties.set(TYPE_CONVERSION_MODE, mode);
        }
    }

    getConversion(from: Type, to: Type): ConversionMode {
        const edge = this.getEdge(from, to);
        if (edge) {
            return edge.properties.get(TYPE_CONVERSION_MODE) as ConversionMode;
        }
        if (this.typir.equality.areTypesEqual(from, to)) {
            return 'SELF';
        } else {
            return 'NONE';
        }
    }

    isConvertible(from: Type, to: Type, mode: ConversionMode): boolean {
        const currentMode = this.getConversion(from, to);
        return currentMode === mode;
    }

    protected getEdge(from: Type, to: Type): TypeEdge | undefined {
        return from.getOutgoingEdges(TYPE_CONVERSION).find(edge => edge.to === to);
    }
}

const TYPE_CONVERSION = 'isConvertibleTo';
const TYPE_CONVERSION_MODE = 'mode';
