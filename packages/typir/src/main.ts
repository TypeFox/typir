/* eslint-disable @typescript-eslint/no-unused-vars */
// eslint-disable-next-line header/header
import { Type } from './graph/type-graph';
import { ClassKind } from './kinds/class-kind';
import { FixedParameterKind } from './kinds/fixed-parameters-kind';
import { FUNCTION_MISSING_NAME, FunctionKind } from './kinds/function-kind';
import { PrimitiveKind } from './kinds/primitive-kind';
import { Typir } from './typir';

/**
 * This file sketches, how to apply Typir in practise.
 */

// start the type system
const typir = new Typir();

// reuse predefined kinds
const primitiveKind = new PrimitiveKind(typir);
const classKind = new ClassKind(typir, { structuralTyping: true, maximumNumberOfSuperClasses: 1, subtypeFieldChecking: 'SUB_TYPE' });
const listKind = new FixedParameterKind(typir, 'List', { relaxedChecking: false }, 'entry');
const mapKind = new FixedParameterKind(typir, 'Map', { relaxedChecking: false }, 'key', 'value');
const functionKind = new FunctionKind(typir);
// TODO how to bundle such definitions for reuse ("presets")?

// create some primitive types
const typeInt = primitiveKind.createPrimitiveType('Integer');
const typeString = primitiveKind.createPrimitiveType('String');
const typeBoolean = primitiveKind.createPrimitiveType('Boolean');

// create class type Person with firstName and age properties
const typePerson = classKind.createClassType('Person', [],
    { name: 'firstName', type: typeString },
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

// TODO more kinds: operators; as a dedicated Service? how to pass/provide the "functionKind"?
function binaryOperator(name: string, inputType: Type, outputType: Type = inputType): Type {
    return functionKind.createFunctionType(name,
        { name: FUNCTION_MISSING_NAME, type: outputType },
        { name: 'left', type: inputType },
        { name: 'right', type: inputType }
    );
}
// binary operators on Integers
const opAdd = binaryOperator('+', typeInt);
const opMinus = binaryOperator('-', typeInt);
const opLess = binaryOperator('<', typeInt, typeBoolean);
const opEqualInt = binaryOperator('==', typeInt, typeBoolean);
// binary operators on Booleans
const opEqualBool = binaryOperator('==', typeBoolean);
const opAnd = binaryOperator('&&', typeBoolean);

// automated conversion from int to string
typir.conversion.markAsConvertible(typeInt, typeString, 'IMPLICIT');
// it is possible to define multiple sources and/or targets at the same time:
typir.conversion.markAsConvertible([typeInt, typeInt], [typeString, typeString, typeString], 'EXPLICIT');

// the rules for type inference need to be specified by the user of Typir
typir.inference = {
    inferType(domainElement: unknown): Type {
        if (typeof domainElement === 'number') {
            return typeInt;
        }
        if (typeof domainElement === 'string') {
            return typeString;
        }
        // TODO add example recursive type inference
        if (Array.isArray(domainElement)) {
            // eslint-disable-next-line dot-notation
            return typir.inference!.inferType(domainElement['element']); // typeListInt;
        }
        return typePerson;
    }
};

// TODO declare operators/functions

// is assignable?
console.log(typir.assignability.isAssignable(typeInt, typeInt)); // => true
console.log(typir.assignability.isAssignable(typeInt, typeString)); // => true
console.log(typir.assignability.isAssignable(typeString, typeInt)); // => false
// TODO extend API for validation with Langium
