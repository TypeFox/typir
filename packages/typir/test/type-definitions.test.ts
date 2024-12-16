/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
******************************************************************************/

/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, expect, test } from 'vitest';
import { ClassKind } from '../src/kinds/class/class-kind.js';
import { FunctionKind, NO_PARAMETER_NAME } from '../src/kinds/function/function-kind.js';
import { PrimitiveKind } from '../src/kinds/primitive/primitive-kind.js';
import { createTypirServices } from '../src/typir.js';
import { MultiplicityKind } from '../src/kinds/multiplicity/multiplicity-kind.js';
import { FixedParameterKind } from '../src/kinds/fixed-parameters/fixed-parameters-kind.js';

describe('Tests for Typir', () => {
    test('Define some types', async () => {
        // start the type system
        const typir = createTypirServices({
            // customize some default factories for predefined types
            factory: {
                Classes: (services) =>new ClassKind(typir, { typing: 'Structural', maximumNumberOfSuperClasses: 1, subtypeFieldChecking: 'SUB_TYPE' }),
            },
        });

        // reuse predefined kinds
        const multiplicityKind = new MultiplicityKind(typir, { symbolForUnlimited: '*' });
        const listKind = new FixedParameterKind(typir, 'List', { parameterSubtypeCheckingStrategy: 'EQUAL_TYPE' }, 'entry');
        const mapKind = new FixedParameterKind(typir, 'Map', { parameterSubtypeCheckingStrategy: 'EQUAL_TYPE' }, 'key', 'value');

        // create some primitive types
        const typeInt = typir.factory.Primitives.create({ primitiveName: 'Integer' });
        const typeString = typir.factory.Primitives.create({ primitiveName: 'String',
            inferenceRules: domainElement => typeof domainElement === 'string'}); // combine type definition with a dedicated inference rule for it
        const typeBoolean = typir.factory.Primitives.create({ primitiveName: 'Boolean' });

        // create class type Person with 1 firstName and 1..2 lastNames and an age properties
        const typeOneOrTwoStrings = multiplicityKind.createMultiplicityType({ constrainedType: typeString, lowerBound: 1, upperBound: 2 });
        const typePerson = typir.factory.Classes.create({
            className: 'Person',
            fields: [
                { name: 'firstName', type: typeString },
                { name: 'lastName', type: typeOneOrTwoStrings },
                { name: 'age', type: typeInt }
            ],
            methods: [],
        });
        console.log(typePerson.getTypeFinal()!.getUserRepresentation());
        const typeStudent = typir.factory.Classes.create({
            className: 'Student',
            superClasses: typePerson, // a Student is a special Person
            fields: [
                { name: 'studentNumber', type: typeInt }
            ],
            methods: []
        });

        // create some more types
        const typeListInt = listKind.createFixedParameterType({ parameterTypes: typeInt });
        const typeListString = listKind.createFixedParameterType({ parameterTypes: typeString });
        // const typeMapStringPerson = mapKind.createFixedParameterType({ parameterTypes: [typeString, typePerson] });
        const typeFunctionStringLength = typir.factory.Functions.create({
            functionName: 'length',
            outputParameter: { name: NO_PARAMETER_NAME, type: typeInt },
            inputParameters: [{ name: 'value', type: typeString }]
        });

        // binary operators on Integers
        const opAdd = typir.factory.Operators.createBinary({ name: '+', signature: { left: typeInt, right: typeInt, return: typeInt } });
        const opMinus = typir.factory.Operators.createBinary({ name: '-', signature: { left: typeInt, right: typeInt, return: typeInt } });
        const opLess = typir.factory.Operators.createBinary({ name: '<', signature: { left: typeInt, right: typeInt, return: typeBoolean } });
        const opEqualInt = typir.factory.Operators.createBinary({ name: '==', signature: { left: typeInt, right: typeInt, return: typeBoolean },
            inferenceRule: {
                filter: (domainElement): domainElement is string => typeof domainElement === 'string',
                matching: domainElement => domainElement.includes('=='),
                operands: domainElement => []
            }});
        // binary operators on Booleans
        const opEqualBool = typir.factory.Operators.createBinary({ name: '==', signature: { left: typeBoolean, right: typeBoolean, return: typeBoolean } });
        const opAnd = typir.factory.Operators.createBinary({ name: '&&', signature: { left: typeBoolean, right: typeBoolean, return: typeBoolean } });
        // unary operators
        const opNotBool = typir.factory.Operators.createUnary({ name: '!', signature: { operand: typeBoolean, return: typeBoolean },
            inferenceRule: {
                filter: (domainElement): domainElement is string => typeof domainElement === 'string',
                matching: domainElement => domainElement.includes('NOT'),
                operand: domainElement => []
            }});
        // ternary operator
        const opTernaryIf = typir.factory.Operators.createTernary({ name: 'if', signature: { first: typeBoolean, second: typeInt, third: typeInt, return: typeInt } });

        // automated conversion from int to string
        // it is possible to define multiple sources and/or targets at the same time:
        typir.Conversion.markAsConvertible([typeInt, typeInt], [typeString, typeString, typeString], 'EXPLICIT');
        // single relationships are possible as well
        typir.Conversion.markAsConvertible(typeInt, typeString, 'IMPLICIT_EXPLICIT');

        // is assignable?
        // primitives
        expect(typir.Assignability.isAssignable(typeInt, typeInt)).toBe(true);
        expect(typir.Assignability.isAssignable(typeInt, typeString)).toBe(true);
        expect(typir.Assignability.isAssignable(typeString, typeInt)).not.toBe(true);
        // List, Map
        // expect(typir.assignability.isAssignable(typeListInt, typeMapStringPerson)).not.toBe(true);
        expect(typir.Assignability.isAssignable(typeListInt, typeListString)).not.toBe(true);
        expect(typir.Assignability.isAssignable(typeListInt, typeListInt)).toBe(true);
        // classes
        // expect(typir.assignability.isAssignable(typeStudent, typePerson)).toBe(true);
        // const assignConflicts = typir.assignability.getAssignabilityProblem(typePerson, typeStudent);
        // expect(assignConflicts).not.toBe(undefined);
        // const msg = typir.printer.printAssignabilityProblem(assignConflicts as AssignabilityProblem);
        // console.log(msg);
    });
});
