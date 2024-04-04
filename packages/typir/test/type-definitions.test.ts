/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
******************************************************************************/

/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, expect, test } from 'vitest';
import { ClassKind } from '../src/kinds/class-kind.js';
import { FixedParameterKind } from '../src/kinds/fixed-parameters-kind.js';
import { FUNCTION_MISSING_NAME, FunctionKind } from '../src/kinds/function-kind.js';
import { MultiplicityKind } from '../src/kinds/multiplicity-kind.js';
import { PrimitiveKind } from '../src/kinds/primitive-kind.js';
import { Typir } from '../src/typir.js';

describe('Tests for Typir', () => {
    test('Define some types', async () => {
        // start the type system
        const typir = new Typir();

        // reuse predefined kinds
        const primitiveKind = new PrimitiveKind(typir);
        const multiplicityKind = new MultiplicityKind(typir, { symbolForUnlimited: '*' });
        const classKind = new ClassKind(typir, { structuralTyping: true, maximumNumberOfSuperClasses: 1, subtypeFieldChecking: 'SUB_TYPE' });
        const listKind = new FixedParameterKind(typir, 'List', { relaxedChecking: false }, 'entry');
        const mapKind = new FixedParameterKind(typir, 'Map', { relaxedChecking: false }, 'key', 'value');
        const functionKind = new FunctionKind(typir);
        // TODO how to bundle such definitions for reuse ("presets")?

        // create some primitive types
        const typeInt = primitiveKind.createPrimitiveType('Integer');
        const typeString = primitiveKind.createPrimitiveType('String',
            domainElement => typeof domainElement === 'string'); // combine type definition with a dedicated inference rule for it
        const typeBoolean = primitiveKind.createPrimitiveType('Boolean');

        // create class type Person with 1 firstName and 1..2 lastNames and a age properties
        const typeOneOrTwoStrings = multiplicityKind.createMultiplicityForType(typeString, 1, 2);
        const typePerson = classKind.createClassType('Person', [],
            { name: 'firstName', type: typeString },
            { name: 'lastName', type: typeOneOrTwoStrings },
            { name: 'age', type: typeInt });
        console.log(typePerson.getUserRepresentation());
        const typeStudent = classKind.createClassType('Student', [typePerson], // a Student is a special Person
            { name: 'studentNumber', type: typeInt });

        // create some more types
        const typeListInt = listKind.createFixedParameterType(typeInt);
        const typeMapStringPerson = mapKind.createFixedParameterType(typeString, typePerson);
        const typeFunctionStringLength = functionKind.createFunctionType('length',
            { name: FUNCTION_MISSING_NAME, type: typeInt },
            { name: 'value', type: typeString });

        // binary operators on Integers
        const opAdd = typir.operators.createBinaryOperator('+', typeInt);
        const opMinus = typir.operators.createBinaryOperator('-', typeInt);
        const opLess = typir.operators.createBinaryOperator('<', typeInt, typeBoolean);
        const opEqualInt = typir.operators.createBinaryOperator('==', typeInt, typeBoolean,
            domainElement => ('' + domainElement).includes('=='));
        // binary operators on Booleans
        const opEqualBool = typir.operators.createBinaryOperator('==', typeBoolean);
        const opAnd = typir.operators.createBinaryOperator('&&', typeBoolean);
        // unary operators
        const opNotBool = typir.operators.createUnaryOperator('!', typeBoolean,
            domainElement => ('' + domainElement).includes('NOT'));
        // ternary operator
        const opTernaryIf = typir.operators.createTernaryOperator('if', typeBoolean, typeInt); // TODO support multiple/arbitrary types!

        // automated conversion from int to string
        // it is possible to define multiple sources and/or targets at the same time:
        typir.conversion.markAsConvertible([typeInt, typeInt], [typeString, typeString, typeString], 'EXPLICIT');
        // single relationships are possible as well
        typir.conversion.markAsConvertible(typeInt, typeString, 'IMPLICIT');

        // TODO easier syntax for multiple variants of types
        // typir.defineOperator({ name: '+', returnType: 'number', operandTypes: ['number', 'number'], inferenceRule: (node) => isBinaryExpression(node) && node.operator === '+', arguments: (node) => [node.left, node.right] });

        // the rules for type inference need to be specified by the user of Typir
        typir.inference.addInferenceRule({
            inferType: (domainElement: unknown) => {
                if (typeof domainElement === 'number') {
                    return typeInt;
                }
                // 'string' is handled already above!
                // TODO add example recursive type inference
                if (Array.isArray(domainElement)) {
                    // eslint-disable-next-line dot-notation
                    return typir.inference.inferType(domainElement[0]); // 'element'; typeListInt;
                }
                return typePerson;
            }
        });

        // is assignable?
        expect(typir.assignability.isAssignable(typeInt, typeInt)).toBeTruthy();
        expect(typir.assignability.isAssignable(typeInt, typeString)).toBeTruthy();
        expect(typir.assignability.isAssignable(typeString, typeInt)).toBeFalsy();
        // TODO extend API for validation with Langium, generate nice error messages
    });
});
