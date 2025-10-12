/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { beforeEach, describe, expect, test } from 'vitest';
import { Type } from '../../../src/graph/type-node.js';
import { PrimitiveType } from '../../../src/kinds/primitive/primitive-type.js';
import { createTypirServicesForTesting, TestingSpecifics } from '../../../src/test/predefined-language-nodes.js';
import { TypirServices } from '../../../src/typir.js';

describe('Create two functions with different parameter types and these parameter types are marked as equal => functions are equal as well', () => {
    let typir: TypirServices<TestingSpecifics>;
    let primitiveA: PrimitiveType;
    let primitiveB: PrimitiveType;

    beforeEach(() => {
        typir = createTypirServicesForTesting();
        primitiveA = typir.factory.Primitives.create({ primitiveName: 'A' }).finish();
        primitiveB = typir.factory.Primitives.create({ primitiveName: 'B' }).finish();
    });

    test('Primitives are equal before creating the functions (input parameters)', () => {
        typir.Equality.markAsEqual(primitiveA, primitiveB);

        // the functions use different types for their input parameter 'p1' ...
        const functionA = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveA }],
            outputParameter: undefined }).finish().getTypeFinal()!;
        const functionB = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveB }],
            outputParameter: undefined }).finish().getTypeFinal()!;

        // but they are equal => the functions are equal as well
        expectEquality(typir, functionA, functionB);

        // unmark the parameter types as equal => functions are not equal anymore
        typir.Equality.unmarkAsEqual(primitiveB, primitiveA); // order of A and B does not matter
        expectUnrelated(typir, functionA, functionB);
    });

    test('Primitives are equal before creating the functions (output parameters)', () => {
        typir.Equality.markAsEqual(primitiveA, primitiveB);

        // the functions use different types for their output parameter ...
        const functionA = typir.factory.Functions.create({ functionName: 'f', inputParameters: [],
            outputParameter: { name: 'out', type: primitiveA } }).finish().getTypeFinal()!;
        const functionB = typir.factory.Functions.create({ functionName: 'f', inputParameters: [],
            outputParameter: { name: 'out', type: primitiveB } }).finish().getTypeFinal()!;

        // but they are equal => the functions are equal as well
        expectEquality(typir, functionA, functionB);

        // unmark the parameter types as equal => functions are not equal anymore
        typir.Equality.unmarkAsEqual(primitiveB, primitiveA); // order of A and B does not matter
        expectUnrelated(typir, functionA, functionB);
    });

    test('Primitives are equal before creating the functions (mixed)', () => {
        typir.Equality.markAsEqual(primitiveA, primitiveB);

        // the functions use different types for their input parameter 'p1' ...
        const functionA = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveA }],
            outputParameter: { name: 'out', type: primitiveB } }).finish().getTypeFinal()!;
        const functionB = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveB }],
            outputParameter: { name: 'out', type: primitiveA } }).finish().getTypeFinal()!;

        // but they are equal => the functions are equal as well
        expectEquality(typir, functionA, functionB);

        // unmark the parameter types as equal => functions are not equal anymore
        typir.Equality.unmarkAsEqual(primitiveB, primitiveA); // order of A and B does not matter
        expectUnrelated(typir, functionA, functionB);
    });

    test('Primitives are equal after creating the functions (input parameters)', () => {
        const functionA = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveA }],
            outputParameter: undefined }).finish().getTypeFinal()!;
        const functionB = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveB }],
            outputParameter: undefined }).finish().getTypeFinal()!;
        expectUnrelated(typir, functionA, functionB);

        typir.Equality.markAsEqual(primitiveB, primitiveA);
        expectEquality(typir, functionA, functionB);

        typir.Equality.unmarkAsEqual(primitiveA, primitiveB);
        expectUnrelated(typir, functionA, functionB);
    });

    test('Primitives are equal after creating the functions (output parameters)', () => {
        const functionA = typir.factory.Functions.create({ functionName: 'f', inputParameters: [],
            outputParameter: { name: 'out', type: primitiveA } }).finish().getTypeFinal()!;
        const functionB = typir.factory.Functions.create({ functionName: 'f', inputParameters: [],
            outputParameter: { name: 'out', type: primitiveB } }).finish().getTypeFinal()!;
        expectUnrelated(typir, functionA, functionB);

        typir.Equality.markAsEqual(primitiveB, primitiveA);
        expectEquality(typir, functionA, functionB);

        typir.Equality.unmarkAsEqual(primitiveA, primitiveB);
        expectUnrelated(typir, functionA, functionB);
    });

    test('Primitives are equal after creating the functions (mixed)', () => {
        const functionA = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveA }],
            outputParameter: { name: 'out', type: primitiveB } }).finish().getTypeFinal()!;
        const functionB = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveB }],
            outputParameter: { name: 'out', type: primitiveA } }).finish().getTypeFinal()!;
        expectUnrelated(typir, functionA, functionB);

        typir.Equality.markAsEqual(primitiveB, primitiveA);
        expectEquality(typir, functionA, functionB);

        typir.Equality.unmarkAsEqual(primitiveA, primitiveB);
        expectUnrelated(typir, functionA, functionB);
    });

    test('Primitives are equal after creating the 1st function and before creating the 2nd function (input parameters)', () => {
        const functionA = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveA }],
            outputParameter: undefined }).finish().getTypeFinal()!;

        typir.Equality.markAsEqual(primitiveB, primitiveA);

        const functionB = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveB }],
            outputParameter: undefined }).finish().getTypeFinal()!;

        expectEquality(typir, functionA, functionB);

        typir.Equality.unmarkAsEqual(primitiveA, primitiveB);
        expectUnrelated(typir, functionA, functionB);

        // do it again
        typir.Equality.markAsEqual(primitiveB, primitiveA);
        expectEquality(typir, functionA, functionB);
        typir.Equality.unmarkAsEqual(primitiveA, primitiveB);
        expectUnrelated(typir, functionA, functionB);
    });

    test('Primitives are equal after creating the 1st function and before creating the 2nd function (output parameters)', () => {
        const functionA = typir.factory.Functions.create({ functionName: 'f', inputParameters: [],
            outputParameter: { name: 'out', type: primitiveA } }).finish().getTypeFinal()!;

        typir.Equality.markAsEqual(primitiveB, primitiveA);

        const functionB = typir.factory.Functions.create({ functionName: 'f', inputParameters: [],
            outputParameter: { name: 'out', type: primitiveB } }).finish().getTypeFinal()!;

        expectEquality(typir, functionA, functionB);

        typir.Equality.unmarkAsEqual(primitiveA, primitiveB);
        expectUnrelated(typir, functionA, functionB);

        // do it again
        typir.Equality.markAsEqual(primitiveB, primitiveA);
        expectEquality(typir, functionA, functionB);
        typir.Equality.unmarkAsEqual(primitiveA, primitiveB);
        expectUnrelated(typir, functionA, functionB);
    });

    test('Primitives are equal after creating the 1st function and before creating the 2nd function (mixed)', () => {
        const functionA = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveA }],
            outputParameter: { name: 'out', type: primitiveB } }).finish().getTypeFinal()!;

        typir.Equality.markAsEqual(primitiveB, primitiveA);

        const functionB = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveB }],
            outputParameter: { name: 'out', type: primitiveA } }).finish().getTypeFinal()!;

        expectEquality(typir, functionA, functionB);

        typir.Equality.unmarkAsEqual(primitiveA, primitiveB);
        expectUnrelated(typir, functionA, functionB);

        // do it again
        typir.Equality.markAsEqual(primitiveB, primitiveA);
        expectEquality(typir, functionA, functionB);
        typir.Equality.unmarkAsEqual(primitiveA, primitiveB);
        expectUnrelated(typir, functionA, functionB);
    });

    test('Functions use functions which use primitives, which are equal => transitive updates', () => {
        const functionA = typir.factory.Functions.create({ functionName: 'f1', inputParameters: [{ name: 'p1', type: primitiveA }],
            outputParameter: undefined }).finish().getTypeFinal()!;
        const functionB = typir.factory.Functions.create({ functionName: 'f1', inputParameters: [{ name: 'p1', type: primitiveB }],
            outputParameter: undefined }).finish().getTypeFinal()!;
        expectUnrelated(typir, functionA, functionB);

        const functionC = typir.factory.Functions.create({ functionName: 'f2', inputParameters: [{ name: 'p2', type: functionA }],
            outputParameter: undefined }).finish().getTypeFinal()!;
        const functionD = typir.factory.Functions.create({ functionName: 'f2', inputParameters: [{ name: 'p2', type: functionB }],
            outputParameter: undefined }).finish().getTypeFinal()!;
        expectUnrelated(typir, functionC, functionD);

        // mark the primitive types as equal
        typir.Equality.markAsEqual(primitiveB, primitiveA);
        expectEquality(typir, functionA, functionB);
        expectEquality(typir, functionC, functionD);

        typir.Equality.unmarkAsEqual(primitiveA, primitiveB);
        expectUnrelated(typir, functionA, functionB);
        expectUnrelated(typir, functionC, functionD);

        // mark the function types as equal
        typir.Equality.markAsEqual(functionA, functionB);
        expectEquality(typir, functionA, functionB);
        expectEquality(typir, functionC, functionD);

        typir.Equality.unmarkAsEqual(functionA, functionB);
        expectUnrelated(typir, functionA, functionB);
        expectUnrelated(typir, functionC, functionD);
    });

});


describe('Create two functions with different parameter types and these parameter types are marked as sub-types => functions are sub-types to each other', () => {
    let typir: TypirServices<TestingSpecifics>;
    let primitiveA: PrimitiveType;
    let primitiveB: PrimitiveType;

    beforeEach(() => {
        typir = createTypirServicesForTesting();
        primitiveA = typir.factory.Primitives.create({ primitiveName: 'A' }).finish();
        primitiveB = typir.factory.Primitives.create({ primitiveName: 'B' }).finish();
    });

    //  The output type of the sub-function needs to be a sub-type of the output type of the super-function.

    test('Primitives are sub-types after creating the functions (output parameter)', () => {
        // the functions use different types for their output parameter ...
        const functionA = typir.factory.Functions.create({ functionName: 'f', inputParameters: [],
            outputParameter: { name: 'out', type: primitiveA } }).finish().getTypeFinal()!;
        const functionB = typir.factory.Functions.create({ functionName: 'f', inputParameters: [],
            outputParameter: { name: 'out', type: primitiveB } }).finish().getTypeFinal()!;
        expectUnrelated(typir, functionB, functionA);

        // but they are marked as sub-types => the functions are sub-types as well
        typir.Subtype.markAsSubType(primitiveB, primitiveA);
        expectSubTypes(typir, functionB, functionA);

        // unmark the parameter types as sub-types => functions are no sub-types anymore
        typir.Subtype.unmarkAsSubType(primitiveB, primitiveA);
        expectUnrelated(typir, functionB, functionA);
    });

    test('Functions use functions as output parameters which use primitives as output parameters, which are marked as sub-types => transitive updates', () => {
        const functionA = typir.factory.Functions.create({ functionName: 'f', inputParameters: [],
            outputParameter: { name: 'out', type: primitiveA } }).finish().getTypeFinal()!;
        const functionB = typir.factory.Functions.create({ functionName: 'f', inputParameters: [],
            outputParameter: { name: 'out', type: primitiveB } }).finish().getTypeFinal()!;
        expectUnrelated(typir, functionB, functionA);

        const functionC = typir.factory.Functions.create({ functionName: 'g', inputParameters: [],
            outputParameter: { name: 'out', type: functionA } }).finish().getTypeFinal()!;
        const functionD = typir.factory.Functions.create({ functionName: 'g', inputParameters: [],
            outputParameter: { name: 'out', type: functionB } }).finish().getTypeFinal()!;
        expectUnrelated(typir, functionD, functionC);

        // mark the primitive types as sub-types
        typir.Subtype.markAsSubType(primitiveB, primitiveA);
        expectSubTypes(typir, functionB, functionA);
        expectSubTypes(typir, functionD, functionC);

        typir.Subtype.unmarkAsSubType(primitiveB, primitiveA);
        expectUnrelated(typir, functionB, functionA);
        expectUnrelated(typir, functionD, functionC);

        // mark the function types as sub-types
        typir.Subtype.markAsSubType(functionB, functionA);
        expectSubTypes(typir, functionB, functionA);
        expectSubTypes(typir, functionD, functionC);

        typir.Subtype.unmarkAsSubType(functionB, functionA);
        expectUnrelated(typir, functionB, functionA);
        expectUnrelated(typir, functionD, functionC);
    });

    test('Functions use functions as input parameters which use primitives as output parameters, which are marked as sub-types => transitive updates', () => {
        const functionA = typir.factory.Functions.create({ functionName: 'f', inputParameters: [],
            outputParameter: { name: 'out', type: primitiveA } }).finish().getTypeFinal()!;
        const functionB = typir.factory.Functions.create({ functionName: 'f', inputParameters: [],
            outputParameter: { name: 'out', type: primitiveB } }).finish().getTypeFinal()!;
        expectUnrelated(typir, functionB, functionA);

        const functionC = typir.factory.Functions.create({ functionName: 'g', inputParameters: [{ name: 'p1', type: functionB }],
            outputParameter: undefined }).finish().getTypeFinal()!;
        const functionD = typir.factory.Functions.create({ functionName: 'g', inputParameters: [{ name: 'p1', type: functionA }],
            outputParameter: undefined }).finish().getTypeFinal()!;
        expectUnrelated(typir, functionD, functionC);

        // mark the primitive types as sub-types
        typir.Subtype.markAsSubType(primitiveB, primitiveA);
        expectSubTypes(typir, functionB, functionA);
        expectSubTypes(typir, functionD, functionC);

        typir.Subtype.unmarkAsSubType(primitiveB, primitiveA);
        expectUnrelated(typir, functionB, functionA);
        expectUnrelated(typir, functionD, functionC);

        // mark the function types as sub-types
        typir.Subtype.markAsSubType(functionB, functionA);
        expectSubTypes(typir, functionB, functionA);
        expectSubTypes(typir, functionD, functionC);

        typir.Subtype.unmarkAsSubType(functionB, functionA);
        expectUnrelated(typir, functionB, functionA);
        expectUnrelated(typir, functionD, functionC);
    });

    //  The output type of the super-function needs to be a sub-type of the output type of the sub-function.

    test('Primitives are sub-types after creating the functions (input parameter)', () => {
        // the functions use different types for their input parameter 'p1' ...
        const functionA = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveB }],
            outputParameter: undefined }).finish().getTypeFinal()!;
        const functionB = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveA }],
            outputParameter: undefined }).finish().getTypeFinal()!;
        expectUnrelated(typir, functionB, functionA);

        typir.Subtype.markAsSubType(primitiveB, primitiveA);
        expectSubTypes(typir, functionB, functionA);

        typir.Subtype.unmarkAsSubType(primitiveB, primitiveA);
        expectUnrelated(typir, functionB, functionA);
    });

    test('Functions use functions as input parameters which use primitives as input parameters, which are marked as sub-types => transitive updates', () => {
        const functionA = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveB }],
            outputParameter: undefined }).finish().getTypeFinal()!;
        const functionB = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveA }],
            outputParameter: undefined }).finish().getTypeFinal()!;
        expectUnrelated(typir, functionB, functionA);

        const functionC = typir.factory.Functions.create({ functionName: 'g', inputParameters: [{ name: 'p1', type: functionB }],
            outputParameter: undefined }).finish().getTypeFinal()!;
        const functionD = typir.factory.Functions.create({ functionName: 'g', inputParameters: [{ name: 'p1', type: functionA }],
            outputParameter: undefined }).finish().getTypeFinal()!;
        expectUnrelated(typir, functionD, functionC);

        // mark the primitive types as sub-types
        typir.Subtype.markAsSubType(primitiveB, primitiveA);
        expectSubTypes(typir, functionB, functionA);
        expectSubTypes(typir, functionD, functionC);

        typir.Subtype.unmarkAsSubType(primitiveB, primitiveA);
        expectUnrelated(typir, functionB, functionA);
        expectUnrelated(typir, functionD, functionC);

        // mark the function types as sub-types
        typir.Subtype.markAsSubType(functionB, functionA);
        expectSubTypes(typir, functionB, functionA);
        expectSubTypes(typir, functionD, functionC);

        typir.Subtype.unmarkAsSubType(functionB, functionA);
        expectUnrelated(typir, functionB, functionA);
        expectUnrelated(typir, functionD, functionC);
    });

    test('Functions use functions as output parameters which use primitives as input parameters, which are marked as sub-types => transitive updates', () => {
        const functionA = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveB }],
            outputParameter: undefined }).finish().getTypeFinal()!;
        const functionB = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveA }],
            outputParameter: undefined }).finish().getTypeFinal()!;
        expectUnrelated(typir, functionB, functionA);

        const functionC = typir.factory.Functions.create({ functionName: 'g', inputParameters: [],
            outputParameter: { name: 'out', type: functionA } }).finish().getTypeFinal()!;
        const functionD = typir.factory.Functions.create({ functionName: 'g', inputParameters: [],
            outputParameter: { name: 'out', type: functionB } }).finish().getTypeFinal()!;
        expectUnrelated(typir, functionD, functionC);

        // mark the primitive types as sub-types
        typir.Subtype.markAsSubType(primitiveB, primitiveA);
        expectSubTypes(typir, functionB, functionA);
        expectSubTypes(typir, functionD, functionC);

        typir.Subtype.unmarkAsSubType(primitiveB, primitiveA);
        expectUnrelated(typir, functionB, functionA);
        expectUnrelated(typir, functionD, functionC);

        // mark the function types as sub-types
        typir.Subtype.markAsSubType(functionB, functionA);
        expectSubTypes(typir, functionB, functionA);
        expectSubTypes(typir, functionD, functionC);

        typir.Subtype.unmarkAsSubType(functionB, functionA);
        expectUnrelated(typir, functionB, functionA);
        expectUnrelated(typir, functionD, functionC);
    });

});


function expectEquality(typir: TypirServices<TestingSpecifics>, type1: Type, type2: Type): void {
    expect(typir.Equality.areTypesEqual(type1, type2)).toBe(true);
    expect(typir.Subtype.isSubType(type1, type2)).toBe(false);
    expect(typir.Subtype.isSubType(type2, type1)).toBe(false);
}

function expectSubTypes(typir: TypirServices<TestingSpecifics>, subType: Type, superType: Type): void {
    expect(typir.Equality.areTypesEqual(subType, superType)).toBe(false);
    expect(typir.Subtype.isSubType(subType, superType)).toBe(true);
    expect(typir.Subtype.isSubType(superType, subType)).toBe(false);
}

function expectUnrelated(typir: TypirServices<TestingSpecifics>, type1: Type, type2: Type): void {
    expect(typir.Equality.areTypesEqual(type1, type2)).toBe(false);
    expect(typir.Subtype.isSubType(type1, type2)).toBe(false);
    expect(typir.Subtype.isSubType(type2, type1)).toBe(false);
}
