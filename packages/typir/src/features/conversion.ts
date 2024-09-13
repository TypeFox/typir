/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { isTypeEdge, TypeEdge } from '../graph/type-edge.js';
import { Type } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { toArray } from '../utils/utils.js';

export type ConversionMode =
    /** coercion
     * (e.g. in "3 + 'three'" the int value 3 is implicitly converted to the string value '3')
     * By default, this relation is transitive (this could be configured).
     * Cycles are not allowed for this relation.
     */
    'IMPLICIT' |
    /** casting
     * (e.g. in "myValue as MyType" the value stored in the variable myValue is explicitly casted to MyType)
     * By default, this relation is not transitive (this could be configured).
     * Cycles are allowed for this relation.
     */
    'EXPLICIT' |
    /** no conversion possible at all (this is the default mode) */
    'NONE' |
    /** a type is always self-convertible to itself, in this case no conversion is necessary */
    'SELF';
// TODO what about intersections of IMPLICIT and EXPLICIT?

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

/**
 * Design decision:
 * - Do not store transitive relationships, since they must be removed, when types of the corresponding path are removed!
 */
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
        let edge = this.getConversionEdge(from, to);
        if (storeNothing) {
            if (edge) {
                // remove an existing edge
                this.typir.graph.removeEdge(edge);
            } else {
                // nothing to do
            }
        } else {
            // add or update the current ConversionMode
            if (!edge) {
                // create a missing edge
                edge = {
                    $meaning: ConversionEdge,
                    from,
                    to,
                    mode,
                };
                this.typir.graph.addEdge(edge);
            } else {
                // update the mode
                edge.mode = mode;
            }

            // check, that the new edges did not introduce cycles
            this.checkForCycles(mode);
        }
    }

    protected checkForCycles(mode: ConversionMode): void {
        if (mode === 'IMPLICIT') {
            this.checkForCyclesLogic(mode);
        } else {
            // all other modes allow cycles
        }
    }
    protected checkForCyclesLogic(_mode: ConversionMode): void {
        // TODO check for cycles and throw an Error in case of found cycles
    }

    protected isTransitive(mode: ConversionMode): boolean {
        // by default, only IMPLICIT is transitive!
        return mode === 'IMPLICIT';
    }

    getConversion(from: Type, to: Type): ConversionMode {
        // check whether the direct conversion is stored in the type graph (this is quite fast)
        const edge = this.getConversionEdge(from, to);
        if (edge) {
            return edge.mode;
        }

        // special case: if both types are equal, no conversion is needed (often this check is quite fast)
        if (this.typir.equality.areTypesEqual(from, to)) {
            return 'SELF';
        }

        // check whether there is a transitive relationship (in general, these checks are expensive)
        if (this.isTransitive('EXPLICIT') && this.isTransitivelyConvertable(from, to, 'EXPLICIT')) {
            return 'EXPLICIT';
        }
        if (this.isTransitive('IMPLICIT') && this.isTransitivelyConvertable(from, to, 'IMPLICIT')) {
            return 'IMPLICIT';
        }

        // the default case
        return 'NONE';
    }

    protected isTransitivelyConvertable(_from: Type, _to: Type, _mode: ConversionMode): boolean {
        // TODO calculate transitive relationship
        return false;
    }

    isConvertible(from: Type, to: Type, mode: ConversionMode): boolean {
        const currentMode = this.getConversion(from, to);
        return currentMode === mode;
    }

    protected getConversionEdge(from: Type, to: Type): ConversionEdge | undefined {
        return from.getOutgoingEdges<ConversionEdge>(ConversionEdge).find(edge => edge.to === to);
    }
}

export interface ConversionEdge extends TypeEdge {
    readonly $meaning: 'ConversionEdge';
    mode: ConversionMode;
}
export const ConversionEdge = 'ConversionEdge';

export function isConversionEdge(edge: unknown): edge is ConversionEdge {
    return isTypeEdge(edge) && edge.$meaning === ConversionEdge;
}
