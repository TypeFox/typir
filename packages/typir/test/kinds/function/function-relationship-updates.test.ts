/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { beforeEach, describe, expect, test } from 'vitest';
import { PrimitiveType } from '../../../src/kinds/primitive/primitive-type.js';
import { createTypirServicesForTesting, TestingSpecifics } from '../../../src/test/predefined-language-nodes.js';
import { TypirServices } from '../../../src/typir.js';

describe('Create two functions with different parameter types, which are marked as equal => functions are equal', () => {
    let typir: TypirServices<TestingSpecifics>;
    let primitiveA: PrimitiveType;
    let primitiveB: PrimitiveType;
    let primitiveVoid: PrimitiveType;

    beforeEach(() => {
        typir = createTypirServicesForTesting();

        // primitive types
        primitiveA = typir.factory.Primitives.create({ primitiveName: 'A' }).finish();
        primitiveB = typir.factory.Primitives.create({ primitiveName: 'B' }).finish();
        primitiveVoid = typir.factory.Primitives.create({ primitiveName: 'void' }).finish();
    });

    test('Primitives are equal before creating the functions (input parameters)', () => {
        typir.Equality.markAsEqual(primitiveA, primitiveB);

        // the functions use different types for their input parameter 'p1' ...
        const functionA = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveA }],
            outputParameter: { name: 'out', type: primitiveVoid } }).finish().getTypeFinal()!;
        const functionB = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveB }],
            outputParameter: { name: 'out', type: primitiveVoid } }).finish().getTypeFinal()!;

        // but they are equal => the functions are equal as well
        expect(typir.Equality.areTypesEqual(functionA, functionB)).toBe(true);

        // unmark the parameter types as equal => functions are not equal anymore
        typir.Equality.unmarkAsEqual(primitiveB, primitiveA); // order of A and B does not matter
        expect(typir.Equality.areTypesEqual(functionA, functionB)).toBe(false);
    });

    test('Primitives are equal before creating the functions (output parameters)', () => {
        typir.Equality.markAsEqual(primitiveA, primitiveB);

        // the functions use different types for their input parameter 'p1' ...
        const functionA = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveVoid }],
            outputParameter: { name: 'out', type: primitiveA } }).finish().getTypeFinal()!;
        const functionB = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveVoid }],
            outputParameter: { name: 'out', type: primitiveB } }).finish().getTypeFinal()!;

        // but they are equal => the functions are equal as well
        expect(typir.Equality.areTypesEqual(functionA, functionB)).toBe(true);

        // unmark the parameter types as equal => functions are not equal anymore
        typir.Equality.unmarkAsEqual(primitiveB, primitiveA); // order of A and B does not matter
        expect(typir.Equality.areTypesEqual(functionA, functionB)).toBe(false);
    });

    test('Primitives are equal before creating the functions (mixed)', () => {
        typir.Equality.markAsEqual(primitiveA, primitiveB);

        // the functions use different types for their input parameter 'p1' ...
        const functionA = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveA }],
            outputParameter: { name: 'out', type: primitiveB } }).finish().getTypeFinal()!;
        const functionB = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveB }],
            outputParameter: { name: 'out', type: primitiveA } }).finish().getTypeFinal()!;

        // but they are equal => the functions are equal as well
        expect(typir.Equality.areTypesEqual(functionA, functionB)).toBe(true);

        // unmark the parameter types as equal => functions are not equal anymore
        typir.Equality.unmarkAsEqual(primitiveB, primitiveA); // order of A and B does not matter
        expect(typir.Equality.areTypesEqual(functionA, functionB)).toBe(false);
    });

    test('Primitives are equal after creating the functions (input parameters)', () => {
        const functionA = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveA }],
            outputParameter: { name: 'out', type: primitiveVoid } }).finish().getTypeFinal()!;
        const functionB = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveB }],
            outputParameter: { name: 'out', type: primitiveVoid } }).finish().getTypeFinal()!;
        expect(typir.Equality.areTypesEqual(functionA, functionB)).toBe(false);

        typir.Equality.markAsEqual(primitiveB, primitiveA);
        expect(typir.Equality.areTypesEqual(functionA, functionB)).toBe(true);

        typir.Equality.unmarkAsEqual(primitiveA, primitiveB);
        expect(typir.Equality.areTypesEqual(functionA, functionB)).toBe(false);
    });

    test('Primitives are equal after creating the functions (output parameters)', () => {
        const functionA = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveVoid }],
            outputParameter: { name: 'out', type: primitiveA } }).finish().getTypeFinal()!;
        const functionB = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveVoid }],
            outputParameter: { name: 'out', type: primitiveB } }).finish().getTypeFinal()!;
        expect(typir.Equality.areTypesEqual(functionA, functionB)).toBe(false);

        typir.Equality.markAsEqual(primitiveB, primitiveA);
        expect(typir.Equality.areTypesEqual(functionA, functionB)).toBe(true);

        typir.Equality.unmarkAsEqual(primitiveA, primitiveB);
        expect(typir.Equality.areTypesEqual(functionA, functionB)).toBe(false);
    });

    test('Primitives are equal after creating the functions (mixed)', () => {
        const functionA = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveA }],
            outputParameter: { name: 'out', type: primitiveB } }).finish().getTypeFinal()!;
        const functionB = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveB }],
            outputParameter: { name: 'out', type: primitiveA } }).finish().getTypeFinal()!;
        expect(typir.Equality.areTypesEqual(functionA, functionB)).toBe(false);

        typir.Equality.markAsEqual(primitiveB, primitiveA);
        expect(typir.Equality.areTypesEqual(functionA, functionB)).toBe(true);

        typir.Equality.unmarkAsEqual(primitiveA, primitiveB);
        expect(typir.Equality.areTypesEqual(functionA, functionB)).toBe(false);
    });

    test('Primitives are equal after creating the 1st function and before creating the 2nd function (input parameters)', () => {
        const functionA = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveA }],
            outputParameter: { name: 'out', type: primitiveVoid } }).finish().getTypeFinal()!;

        typir.Equality.markAsEqual(primitiveB, primitiveA);

        const functionB = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveB }],
            outputParameter: { name: 'out', type: primitiveVoid } }).finish().getTypeFinal()!;

        expect(typir.Equality.areTypesEqual(functionA, functionB)).toBe(true);

        typir.Equality.unmarkAsEqual(primitiveA, primitiveB);
        expect(typir.Equality.areTypesEqual(functionA, functionB)).toBe(false);

        // do it again
        typir.Equality.markAsEqual(primitiveB, primitiveA);
        expect(typir.Equality.areTypesEqual(functionA, functionB)).toBe(true);
        typir.Equality.unmarkAsEqual(primitiveA, primitiveB);
        expect(typir.Equality.areTypesEqual(functionA, functionB)).toBe(false);
    });

    test('Primitives are equal after creating the 1st function and before creating the 2nd function (output parameters)', () => {
        const functionA = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveVoid }],
            outputParameter: { name: 'out', type: primitiveA } }).finish().getTypeFinal()!;

        typir.Equality.markAsEqual(primitiveB, primitiveA);

        const functionB = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveVoid }],
            outputParameter: { name: 'out', type: primitiveB } }).finish().getTypeFinal()!;

        expect(typir.Equality.areTypesEqual(functionA, functionB)).toBe(true);

        typir.Equality.unmarkAsEqual(primitiveA, primitiveB);
        expect(typir.Equality.areTypesEqual(functionA, functionB)).toBe(false);

        // do it again
        typir.Equality.markAsEqual(primitiveB, primitiveA);
        expect(typir.Equality.areTypesEqual(functionA, functionB)).toBe(true);
        typir.Equality.unmarkAsEqual(primitiveA, primitiveB);
        expect(typir.Equality.areTypesEqual(functionA, functionB)).toBe(false);
    });

    test('Primitives are equal after creating the 1st function and before creating the 2nd function (mixed)', () => {
        const functionA = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveA }],
            outputParameter: { name: 'out', type: primitiveB } }).finish().getTypeFinal()!;

        typir.Equality.markAsEqual(primitiveB, primitiveA);

        const functionB = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveB }],
            outputParameter: { name: 'out', type: primitiveA } }).finish().getTypeFinal()!;

        expect(typir.Equality.areTypesEqual(functionA, functionB)).toBe(true);

        typir.Equality.unmarkAsEqual(primitiveA, primitiveB);
        expect(typir.Equality.areTypesEqual(functionA, functionB)).toBe(false);

        // do it again
        typir.Equality.markAsEqual(primitiveB, primitiveA);
        expect(typir.Equality.areTypesEqual(functionA, functionB)).toBe(true);
        typir.Equality.unmarkAsEqual(primitiveA, primitiveB);
        expect(typir.Equality.areTypesEqual(functionA, functionB)).toBe(false);
    });



    test('Functions use functions which use primitives, which are equal => transitive updates', () => {
        const functionA = typir.factory.Functions.create({ functionName: 'f1', inputParameters: [{ name: 'p1', type: primitiveA }],
            outputParameter: { name: 'out', type: primitiveVoid } }).finish().getTypeFinal()!;
        const functionB = typir.factory.Functions.create({ functionName: 'f1', inputParameters: [{ name: 'p1', type: primitiveB }],
            outputParameter: { name: 'out', type: primitiveVoid } }).finish().getTypeFinal()!;
        expect(typir.Equality.areTypesEqual(functionA, functionB)).toBe(false);

        const functionC = typir.factory.Functions.create({ functionName: 'f2', inputParameters: [{ name: 'p2', type: functionA }],
            outputParameter: { name: 'out', type: primitiveVoid } }).finish().getTypeFinal()!;
        const functionD = typir.factory.Functions.create({ functionName: 'f2', inputParameters: [{ name: 'p2', type: functionB }],
            outputParameter: { name: 'out', type: primitiveVoid } }).finish().getTypeFinal()!;
        expect(typir.Equality.areTypesEqual(functionC, functionD)).toBe(false);

        // mark the primitive types as equal
        typir.Equality.markAsEqual(primitiveB, primitiveA);
        expect(typir.Equality.areTypesEqual(functionA, functionB)).toBe(true);
        expect(typir.Equality.areTypesEqual(functionC, functionD)).toBe(true);

        typir.Equality.unmarkAsEqual(primitiveA, primitiveB);
        expect(typir.Equality.areTypesEqual(functionA, functionB)).toBe(false);
        expect(typir.Equality.areTypesEqual(functionC, functionD)).toBe(false);

        // mark the function types as equal
        typir.Equality.markAsEqual(functionA, functionB);
        expect(typir.Equality.areTypesEqual(functionA, functionB)).toBe(true);
        expect(typir.Equality.areTypesEqual(functionC, functionD)).toBe(true);

        typir.Equality.unmarkAsEqual(functionA, functionB);
        expect(typir.Equality.areTypesEqual(functionA, functionB)).toBe(false);
        expect(typir.Equality.areTypesEqual(functionC, functionD)).toBe(false);
    });

});

describe('Create two functions with different parameter types, which are marked as sub-types => functions are sub-types to each other', () => {
    let typir: TypirServices<TestingSpecifics>;
    let primitiveA: PrimitiveType;
    let primitiveB: PrimitiveType;
    let primitiveVoid: PrimitiveType;

    beforeEach(() => {
        typir = createTypirServicesForTesting();

        // primitive types
        primitiveA = typir.factory.Primitives.create({ primitiveName: 'A' }).finish();
        primitiveB = typir.factory.Primitives.create({ primitiveName: 'B' }).finish();
        primitiveVoid = typir.factory.Primitives.create({ primitiveName: 'void' }).finish();
    });

    test('Primitives are sub-types after creating the functions (output parameter)', () => {
        // typir.Subtype.markAsSubType(primitiveB, primitiveA);

        // the functions use different types for their output parameter 'p1' ...
        const functionA = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveVoid }],
            outputParameter: { name: 'out', type: primitiveA } }).finish().getTypeFinal()!;
        const functionB = typir.factory.Functions.create({ functionName: 'f', inputParameters: [{ name: 'p1', type: primitiveVoid }],
            outputParameter: { name: 'out', type: primitiveB } }).finish().getTypeFinal()!;
        expect(typir.Subtype.isSubType(functionB, functionA)).toBe(false);

        // but they are equal => the functions are equal as well
        typir.Subtype.markAsSubType(primitiveB, primitiveA);
        expect(typir.Subtype.isSubType(functionB, functionA)).toBe(true);

        // unmark the parameter types as equal => functions are not equal anymore
        typir.Subtype.unmarkAsSubType(primitiveB, primitiveA);
        expect(typir.Subtype.isSubType(functionB, functionA)).toBe(false);
    });

});
