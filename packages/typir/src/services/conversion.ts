/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { GraphAlgorithms } from '../graph/graph-algorithms.js';
import { isTypeEdge, TypeEdge } from '../graph/type-edge.js';
import { TypeGraph } from '../graph/type-graph.js';
import { Type } from '../graph/type-node.js';
import { TypirServices } from '../typir.js';
import { toArray } from '../utils/utils.js';
import { TypeEquality } from './equality.js';

/**
 * Describes the possible conversion modes.
 *
 * IMPLICIT means coercion,
 * e.g. in "3 + 'three'" the int value 3 is implicitly converted to the string value '3'.
 * By default, this relation is transitive (this could be configured).
 * Cycles are not allowed for this relation.
 *
 * EXPLICIT means casting,
 * e.g. in "myValue as MyType" the value stored in the variable myValue is explicitly casted to MyType.
 * By default, this relation is not transitive (this could be configured).
 * Cycles are allowed for this relation.
 */
export type ConversionModeForSpecification =
    /** The conversion is implicitly possible. In this case, the explicit conversion is possible as well (IMPLICIT => EXPLICIT). */
    'IMPLICIT_EXPLICIT' |
    /** The conversion is only explicitly possible */
    'EXPLICIT';
export type ConversionMode =
    ConversionModeForSpecification |
    /** no conversion possible at all (this is the default mode) */
    'NONE' |
    /** a type is always self-convertible to itself (implicitly or explicitly), in this case no conversion is necessary */
    'SELF';

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
    markAsConvertible(from: Type | Type[], to: Type | Type[], mode: ConversionModeForSpecification): void;

    /**
     * Identifies the existing conversion relationship between two given types.
     * @param from the from/source type
     * @param to the to/target type
     * @returns the existing conversion relationship between the two given types
     */
    getConversion(from: Type, to: Type): ConversionMode;

    /**
     * Checks whether the given two types are implicitly (or explicitly) convertible.
     * @param from the from/source type
     * @param to the to/target type
     * @returns true if the conversion is possible, false otherwise
     */
    isImplicitExplicitConvertible(from: Type, to: Type): boolean;
    /**
     * Checks whether the given two types are (only) explicitly convertible.
     * @param from the from/source type
     * @param to the to/target type
     * @returns true if the conversion is possible, false otherwise
     */
    isExplicitConvertible(from: Type, to: Type): boolean;
    /**
     * Checks whether the given two types are not convertible (and are not equals).
     * @param from the from/source type
     * @param to the to/target type
     * @returns true if the conversion is not possible, false otherwise
     */
    isNoneConvertible(from: Type, to: Type): boolean;
    /**
     * Checks whether the given two types are (implicitly or explicitly) convertible, since they are equal.
     * @param from the from/source type
     * @param to the to/target type
     * @returns true if the types are equal, false otherwise
     */
    isSelfConvertible(from: Type, to: Type): boolean;
    /**
     * Checks whether the given two types are convertible (EXPLICIT or IMPLICIT or SELF).
     * @param from the from/source type
     * @param to the to/target type
     * @returns true if the implicit or explicit conversion is possible or the types are equal, false otherwise
     */
    isConvertible(from: Type, to: Type): boolean;

    /**
     * Returns all other types to which the given type can be recursively converted.
     * @param from the source type, which is convertible to the returned types
     * @param mode only conversion rules with the given conversion mode are considered
     * @returns the set of recursively reachable types for conversion ("conversion targets")
     */
    getConvertibleTo(from: Type, mode: ConversionModeForSpecification): Set<Type>;
}

/**
 * Design decisions:
 * - Do not store transitive relationships, since they must be removed, when types of the corresponding path are removed!
 * - Store only EXPLICIT and IMPLICIT relationships, since this is not required, missing edges means NONE/SELF.
 */
export class DefaultTypeConversion implements TypeConversion {
    protected readonly equality: TypeEquality;
    protected readonly graph: TypeGraph;
    protected readonly algorithms: GraphAlgorithms;

    constructor(services: TypirServices) {
        this.equality = services.Equality;
        this.graph = services.infrastructure.Graph;
        this.algorithms = services.infrastructure.GraphAlgorithms;
    }

    markAsConvertible(from: Type | Type[], to: Type | Type[], mode: ConversionModeForSpecification): void {
        const allFrom = toArray(from);
        const allTo = toArray(to);
        for (const f of allFrom) {
            for (const t of allTo) {
                this.markAsConvertibleSingle(f, t, mode);
            }
        }
    }

    protected markAsConvertibleSingle(from: Type, to: Type, mode: ConversionModeForSpecification): void {
        let edge = this.getConversionEdge(from, to);
        if (!edge) {
            // create a missing edge (with the desired mode)
            edge = {
                $relation: ConversionEdge,
                from,
                to,
                cachingInformation: 'LINK_EXISTS',
                mode,
            };
            this.graph.addEdge(edge);
        } else {
            // update the mode
            edge.mode = mode;
        }

        if (mode === 'IMPLICIT_EXPLICIT') {
            /* check that the new edges did not introduce cycles
             * if it did, the from node will be reachable via a cycle path
             */
            const hasIntroducedCycle = this.existsEdgePath(from, from, mode);
            if (hasIntroducedCycle) {
                throw new Error(`Adding the conversion from ${from.getIdentifier()} to ${to.getIdentifier()} with mode ${mode} has introduced a cycle in the type graph.`);
            }
        }
    }

    protected isTransitive(mode: ConversionModeForSpecification): boolean {
        // by default, only IMPLICIT is transitive!
        return mode === 'IMPLICIT_EXPLICIT';
    }

    getConversion(from: Type, to: Type): ConversionMode {
        // check whether the direct conversion is stored in the type graph (this is quite fast)
        const edge = this.getConversionEdge(from, to);
        if (edge) {
            return edge.mode;
        }

        // special case: if both types are equal, no conversion is needed (often this check is quite fast)
        if (this.equality.areTypesEqual(from, to)) {
            return 'SELF';
        }

        // check whether there is a transitive relationship (in general, these checks are expensive)
        if (this.isTransitive('EXPLICIT') && this.isTransitivelyConvertable(from, to, 'EXPLICIT')) {
            return 'EXPLICIT';
        }
        if (this.isTransitive('IMPLICIT_EXPLICIT') && this.isTransitivelyConvertable(from, to, 'IMPLICIT_EXPLICIT')) {
            return 'IMPLICIT_EXPLICIT';
        }

        // the default case
        return 'NONE';
    }

    protected collectReachableTypes(from: Type, mode: ConversionModeForSpecification): Set<Type> {
        return this.algorithms.collectReachableTypes(from, [ConversionEdge], edge => (edge as ConversionEdge).mode === mode);
    }

    protected existsEdgePath(from: Type, to: Type, mode: ConversionModeForSpecification): boolean {
        return this.algorithms.existsEdgePath(from, to, [ConversionEdge], edge => (edge as ConversionEdge).mode === mode);
    }

    protected isTransitivelyConvertable(from: Type, to: Type, mode: ConversionModeForSpecification): boolean {
        if (from === to) {
            return true;
        } else {
            return(this.existsEdgePath(from, to, mode));
        }
    }

    isImplicitExplicitConvertible(from: Type, to: Type): boolean {
        return this.getConversion(from, to) === 'IMPLICIT_EXPLICIT';
    }
    isExplicitConvertible(from: Type, to: Type): boolean {
        return this.getConversion(from, to) === 'EXPLICIT';
    }
    isNoneConvertible(from: Type, to: Type): boolean {
        return this.getConversion(from, to) === 'NONE';
    }
    isSelfConvertible(from: Type, to: Type): boolean {
        return this.getConversion(from, to) === 'SELF';
    }

    isConvertible(from: Type, to: Type): boolean {
        const currentMode = this.getConversion(from, to);
        return currentMode === 'IMPLICIT_EXPLICIT' || currentMode === 'EXPLICIT' || currentMode === 'SELF';
    }

    protected getConversionEdge(from: Type, to: Type): ConversionEdge | undefined {
        return from.getOutgoingEdges<ConversionEdge>(ConversionEdge).find(edge => edge.to === to);
    }

    getConvertibleTo(from: Type, mode: ConversionModeForSpecification): Set<Type> {
        return this.collectReachableTypes(from, mode);
    }
}

export interface ConversionEdge extends TypeEdge {
    readonly $relation: 'ConversionEdge';
    mode: ConversionMode;
}
export const ConversionEdge = 'ConversionEdge';

export function isConversionEdge(edge: unknown): edge is ConversionEdge {
    return isTypeEdge(edge) && edge.$relation === ConversionEdge;
}
