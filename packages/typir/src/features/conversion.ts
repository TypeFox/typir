/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeEdge } from '../graph/type-edge.js';
import { TypeGraph } from '../graph/type-graph.js';
import { Type } from '../graph/type-node.js';
import { TypirServices } from '../typir.js';
import { toArray } from '../utils/utils.js';
import { TypeEquality } from './equality.js';

export type ConversionMode =
    'IMPLICIT' | // coercion (e.g. in "3 + 'three'" the int value 3 is implicitly converted to the string value '3')
    'EXPLICIT' | // casting (e.g. in "myValue as MyType" the value stored in the variable myValue is explicitly casted to MyType)
    'NONE' |     // no conversion possible at all (this is the default mode)
    'SELF';      // a type is always self-convertible to itself, in this case no conversion is necessary

/**
 * Manages conversions between different types.
 * A conversion is a directed relationship between two types.
 * If a source type can be converted to a target type, the source type could be assignable to the target type (depending on the conversion mode: target := source).
 */
export interface TypeConversion {
    /**
     * Defines the conversion relationship between two types.
     * @param from the from/source type
     * @param to the to/target type
     * @param mode the desired conversion relationship between the two given types
     */
    markAsConvertible(from: Type | Type[], to: Type | Type[], mode: ConversionMode): void

    /**
     * Identifies the existing conversion relationship between two given types.
     * @param from the from/source type
     * @param to the to/target type
     * @returns the existing conversion relationship between the two given types
     */
    getConversion(from: Type, to: Type): ConversionMode;

    /**
     * Checks whether the given conversion relationship exists between two types.
     * @param from the from/source type
     * @param to the to/target type
     * @param mode the conversion relationship to check between the two given types
     * @returns
     */
    isConvertible(from: Type, to: Type, mode: ConversionMode): boolean;
}

export class DefaultTypeConversion implements TypeConversion {
    protected readonly equality: TypeEquality;
    protected readonly graph: TypeGraph;

    constructor(services: TypirServices) {
        this.equality = services.equality;
        this.graph = services.graph;
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
                this.graph.removeEdge(edge);
            } else {
                // nothing to do
            }
        } else {
            if (!edge) {
                // create a missing edge
                edge = new TypeEdge(from, to, TYPE_CONVERSION);
                this.graph.addEdge(edge);
            }
            edge.properties.set(TYPE_CONVERSION_MODE, mode);
        }
    }

    getConversion(from: Type, to: Type): ConversionMode {
        // check whether the conversion is stored in the type graph
        const edge = this.getEdge(from, to);
        if (edge) {
            return edge.properties.get(TYPE_CONVERSION_MODE) as ConversionMode;
        }

        // special case: if both types are equal, no conversion is needed
        if (this.equality.areTypesEqual(from, to)) {
            return 'SELF';
        }

        // the default case
        return 'NONE';
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
