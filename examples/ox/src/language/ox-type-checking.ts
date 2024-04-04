/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
******************************************************************************/

/* eslint-disable @typescript-eslint/no-unused-vars */
import { PrimitiveKind, Typir } from 'typir';
import { BinaryExpression, UnaryExpression, isBinaryExpression, isBooleanExpression, isNumberExpression, isUnaryExpression } from './generated/ast.js';

export function createTypir(): Typir {
    const typir = new Typir();
    const primitiveKind = new PrimitiveKind(typir);
    const operators = typir.operators;

    // types
    const typeBool = primitiveKind.createPrimitiveType('boolean', (node) => isBooleanExpression(node));
    const typeNumber = primitiveKind.createPrimitiveType('number', (node) => isNumberExpression(node));
    // TODO: void

    // binary operators
    // const opAdd = operators.createBinaryOperator(['+', '-'], typeNumber, typeNumber, (node, opName) => isBinaryExpression(node) && node.operator === opName);
    // const opAdd = operators.createBinaryOperator('+', typeNumber, typeNumber);
    const opAdd = operators.createBinaryOperator('+', typeNumber, typeNumber,
        (node) => isBinaryExpression(node) && node.operator === '+',
        (node) => [(node as BinaryExpression).left, (node as BinaryExpression).right]);
    const opSub = operators.createBinaryOperator('-', typeNumber, typeNumber,
        (node) => isBinaryExpression(node) && node.operator === '-',
        (node) => [(node as BinaryExpression).left, (node as BinaryExpression).right]);
    const opAnd = operators.createBinaryOperator('and', typeBool, typeBool,
        (node) => isBinaryExpression(node) && node.operator === 'and',
        (node) => [(node as BinaryExpression).left, (node as BinaryExpression).right]);
    const opOr = operators.createBinaryOperator('or', typeBool, typeBool,
        (node) => isBinaryExpression(node) && node.operator === 'or',
        (node) => [(node as BinaryExpression).left, (node as BinaryExpression).right]);
    // TODO: <=, <, ... for boolean and numbers!

    // instead of having multiple small inference rules for each type, you could write a single inference rule as alternative
    // typir.inference.addInferenceRule({
    //     inferType(domainElement) {
    //         if (isBinaryExpression(domainElement)) {
    //             switch (domainElement.operator) {
    //                 case '+': return opAdd;
    //                 case '!=':
    //                 case '*':
    //                 case '-': return opSub;
    //                 case '/':
    //                 case '<':
    //                 case '<=':
    //                 case '==':
    //                 case '>':
    //                 case '>=':
    //                 case 'and': return opAnd;
    //                 case 'or': return opOr;
    //             }
    //         }
    //         return undefined;
    //     },
    // });

    // unary operators
    const opNot = operators.createUnaryOperator('!', typeBool,
        (node) => isUnaryExpression(node) && node.operator === '!',
        (node) => (node as UnaryExpression).value);
    const opNegative = operators.createUnaryOperator('-', typeNumber,
        (node) => isUnaryExpression(node) && node.operator === '-',
        (node) => (node as UnaryExpression).value);

    // TODO validation
    // TODO error message

    return typir;
}
