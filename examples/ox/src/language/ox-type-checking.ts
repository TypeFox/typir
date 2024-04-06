/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
******************************************************************************/

/* eslint-disable @typescript-eslint/no-unused-vars */
import { PrimitiveKind, Type, Typir } from 'typir';
import { BinaryExpression, MemberCall, TypeReference, UnaryExpression, VariableDeclaration, isBinaryExpression, isBooleanExpression, isFunctionDeclaration, isMemberCall, isNumberExpression, isParameter, isTypeReference, isUnaryExpression, isVariableDeclaration } from './generated/ast.js';
import { assertUnreachable } from 'langium';

export function createTypir(): Typir {
    // set up Typir and reuse some predefined things
    const typir = new Typir();
    const primitiveKind = new PrimitiveKind(typir);
    const operators = typir.operators;

    // types
    const typeBool = primitiveKind.createPrimitiveType('boolean', (node) => isBooleanExpression(node));
    const typeNumber = primitiveKind.createPrimitiveType('number', (node) => isNumberExpression(node));
    const typeVoid = primitiveKind.createPrimitiveType('void'); // TODO own kind for 'void'?

    // utility function to map language types to Typir types
    function mapType(typeRef: TypeReference): Type {
        switch (typeRef.primitive) {
            case 'number': return typeNumber;
            case 'boolean': return typeBool;
            case 'void': return typeVoid;
            default: assertUnreachable(typeRef.primitive);
        }
    }

    // binary operators: numbers => number
    const opAdd = operators.createBinaryOperator('+', typeNumber, typeNumber,
        (node) => isBinaryExpression(node) && node.operator === '+',
        (node) => [(node as BinaryExpression).left, (node as BinaryExpression).right]);
    const opSub = operators.createBinaryOperator('-', typeNumber, typeNumber,
        (node) => isBinaryExpression(node) && node.operator === '-',
        (node) => [(node as BinaryExpression).left, (node as BinaryExpression).right]);
    const opMul = operators.createBinaryOperator('*', typeNumber, typeNumber,
        (node) => isBinaryExpression(node) && node.operator === '*',
        (node) => [(node as BinaryExpression).left, (node as BinaryExpression).right]);
    const opDiv = operators.createBinaryOperator('/', typeNumber, typeNumber,
        (node) => isBinaryExpression(node) && node.operator === '/',
        (node) => [(node as BinaryExpression).left, (node as BinaryExpression).right]);
    // TODO simplify this: with alternative function? with Langium binding?

    // binary operators: numbers => boolean
    const opLt = operators.createBinaryOperator('<', typeNumber, typeBool,
        (node) => isBinaryExpression(node) && node.operator === '<',
        (node) => [(node as BinaryExpression).left, (node as BinaryExpression).right]);
    const opLeq = operators.createBinaryOperator('<=', typeNumber, typeBool,
        (node) => isBinaryExpression(node) && node.operator === '<=',
        (node) => [(node as BinaryExpression).left, (node as BinaryExpression).right]);
    const opGt = operators.createBinaryOperator('>', typeNumber, typeBool,
        (node) => isBinaryExpression(node) && node.operator === '>',
        (node) => [(node as BinaryExpression).left, (node as BinaryExpression).right]);
    const opGeq = operators.createBinaryOperator('>=', typeNumber, typeBool,
        (node) => isBinaryExpression(node) && node.operator === '>=',
        (node) => [(node as BinaryExpression).left, (node as BinaryExpression).right]);

    // binary operators: booleans => boolean
    const opAnd = operators.createBinaryOperator('and', typeBool, typeBool,
        (node) => isBinaryExpression(node) && node.operator === 'and',
        (node) => [(node as BinaryExpression).left, (node as BinaryExpression).right]);
    const opOr = operators.createBinaryOperator('or', typeBool, typeBool,
        (node) => isBinaryExpression(node) && node.operator === 'or',
        (node) => [(node as BinaryExpression).left, (node as BinaryExpression).right]);

    // ==, != for booleans and numbers
    const opEq = operators.createBinaryOperator('==', [typeNumber, typeBool], typeBool,
        (node) => isBinaryExpression(node) && node.operator === '==',
        (node) => [(node as BinaryExpression).left, (node as BinaryExpression).right]);
    const opNeq = operators.createBinaryOperator('!=', [typeNumber, typeBool], typeBool,
        (node) => isBinaryExpression(node) && node.operator === '!=',
        (node) => [(node as BinaryExpression).left, (node as BinaryExpression).right]);

    // unary operators
    const opNot = operators.createUnaryOperator('!', typeBool,
        (node) => isUnaryExpression(node) && node.operator === '!',
        (node) => (node as UnaryExpression).value);
    const opNegative = operators.createUnaryOperator('-', typeNumber,
        (node) => isUnaryExpression(node) && node.operator === '-',
        (node) => (node as UnaryExpression).value);

    // additional inference rules ...
    // ... for member calls
    typir.inference.addInferenceRule({
        isRuleApplicable(domainElement) {
            if (isMemberCall(domainElement)) {
                const ref = domainElement.element.ref;
                if (isVariableDeclaration(ref)) {
                    return mapType(ref.type);
                } else if (isParameter(ref)) {
                    return mapType(ref.type);
                } else if (isFunctionDeclaration(ref)) {
                    return mapType(ref.returnType);
                } else {
                    throw new Error();
                }
            }
            return false;
        },
    });
    // ... for declared variables
    typir.inference.addInferenceRule({
        isRuleApplicable(domainElement) {
            if (isTypeReference(domainElement)) {
                return mapType(domainElement);
            }
            if (isVariableDeclaration(domainElement)) {
                return mapType(domainElement.type);
            }
            return false;
        },
    });

    return typir;
}
