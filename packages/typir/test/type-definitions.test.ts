/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
******************************************************************************/

/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, expect, test } from 'vitest';
import { AssignabilityProblem } from '../src/features/assignability.js';
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
        const classKind = new ClassKind(typir, { typing: 'Structural', maximumNumberOfSuperClasses: 1, subtypeFieldChecking: 'SUB_TYPE' });
        const listKind = new FixedParameterKind(typir, 'List', { parameterSubtypeCheckingStrategy: 'EQUAL_TYPE' }, 'entry');
        const mapKind = new FixedParameterKind(typir, 'Map', { parameterSubtypeCheckingStrategy: 'EQUAL_TYPE' }, 'key', 'value');
        const functionKind = new FunctionKind(typir);

        // create some primitive types
        const typeInt = primitiveKind.createPrimitiveType({ primitiveName: 'Integer' });
        const typeString = primitiveKind.createPrimitiveType({ primitiveName: 'String',
            inferenceRules: domainElement => typeof domainElement === 'string'}); // combine type definition with a dedicated inference rule for it
        const typeBoolean = primitiveKind.createPrimitiveType({ primitiveName: 'Boolean' });

        // create class type Person with 1 firstName and 1..2 lastNames and a age properties
        const typeOneOrTwoStrings = multiplicityKind.createMultiplicityType({ constrainedType: typeString, lowerBound: 1, upperBound: 2 });
        const typePerson = classKind.createClassType({
            className: 'Person',
            fields: [
                { name: 'firstName', type: typeString },
                { name: 'lastName', type: typeOneOrTwoStrings },
                { name: 'age', type: typeInt }
            ]});
        console.log(typePerson.getUserRepresentation());
        const typeStudent = classKind.createClassType({
            className: 'Student',
            superClasses: typePerson, // a Student is a special Person
            fields: [
                { name: 'studentNumber', type: typeInt }
            ]});

        // create some more types
        const typeListInt = listKind.createFixedParameterType({ parameterTypes: typeInt });
        const typeListString = listKind.createFixedParameterType({ parameterTypes: typeString });
        const typeMapStringPerson = mapKind.createFixedParameterType({ parameterTypes: [typeString, typePerson] });
        const typeFunctionStringLength = functionKind.createFunctionType({
            functionName: 'length',
            outputParameter: { name: FUNCTION_MISSING_NAME, type: typeInt },
            inputParameters: [{ name: 'value', type: typeString }]
        });

        // binary operators on Integers
        const opAdd = typir.operators.createBinaryOperator({ name: '+', signature: { left: typeInt, right: typeInt, return: typeInt } });
        const opMinus = typir.operators.createBinaryOperator({ name: '-', signature: { left: typeInt, right: typeInt, return: typeInt } });
        const opLess = typir.operators.createBinaryOperator({ name: '<', signature: { left: typeInt, right: typeInt, return: typeBoolean } });
        const opEqualInt = typir.operators.createBinaryOperator({ name: '==', signature: { left: typeInt, right: typeInt, return: typeBoolean },
            inferenceRule: {
                filter: (domainElement): domainElement is string => typeof domainElement === 'string',
                matching: domainElement => domainElement.includes('=='),
                operands: domainElement => []
            }});
        // binary operators on Booleans
        const opEqualBool = typir.operators.createBinaryOperator({ name: '==', signature: { left: typeBoolean, right: typeBoolean, return: typeBoolean } });
        const opAnd = typir.operators.createBinaryOperator({ name: '&&', signature: { left: typeBoolean, right: typeBoolean, return: typeBoolean } });
        // unary operators
        const opNotBool = typir.operators.createUnaryOperator({ name: '!', signature: { operand: typeBoolean, return: typeBoolean },
            inferenceRule: {
                filter: (domainElement): domainElement is string => typeof domainElement === 'string',
                matching: domainElement => domainElement.includes('NOT'),
                operand: domainElement => []
            }});
        // ternary operator
        const opTernaryIf = typir.operators.createTernaryOperator({ name: 'if', signature: { first: typeBoolean, second: typeInt, third: typeInt, return: typeInt } });

        // automated conversion from int to string
        // it is possible to define multiple sources and/or targets at the same time:
        typir.conversion.markAsConvertible([typeInt, typeInt], [typeString, typeString, typeString], 'EXPLICIT');
        // single relationships are possible as well
        typir.conversion.markAsConvertible(typeInt, typeString, 'IMPLICIT_EXPLICIT');

        // is assignable?
        // primitives
        expect(typir.assignability.isAssignable(typeInt, typeInt)).toBe(true);
        expect(typir.assignability.isAssignable(typeInt, typeString)).toBe(true);
        expect(typir.assignability.isAssignable(typeString, typeInt)).not.toBe(true);
        // List, Map
        expect(typir.assignability.isAssignable(typeListInt, typeMapStringPerson)).not.toBe(true);
        expect(typir.assignability.isAssignable(typeListInt, typeListString)).not.toBe(true);
        expect(typir.assignability.isAssignable(typeListInt, typeListInt)).toBe(true);
        // classes
        expect(typir.assignability.isAssignable(typeStudent, typePerson)).toBe(true);
        const assignConflicts = typir.assignability.getAssignabilityProblem(typePerson, typeStudent);
        expect(assignConflicts).not.toBe(undefined);
        const msg = typir.printer.printAssignabilityProblem(assignConflicts as AssignabilityProblem);
        console.log(msg);
    });
});
