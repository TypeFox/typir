/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
******************************************************************************/

/* eslint-disable @typescript-eslint/no-unused-vars */
import { AstNode, AstUtils, assertUnreachable } from 'langium';
import { FUNCTION_MISSING_NAME, FunctionKind, PrimitiveKind, Type, Typir } from 'typir';
import { BinaryExpression, TypeReference, UnaryExpression, isBinaryExpression, isBooleanExpression, isFunctionDeclaration, isMemberCall, isNumberExpression, isOxProgram, isParameter, isTypeReference, isUnaryExpression, isVariableDeclaration } from './generated/ast.js';

export function createTypir(nodeEntry: AstNode): Typir {
    const nodeRoot = AstUtils.getContainerOfType(nodeEntry, isOxProgram)!;

    // set up Typir and reuse some predefined things
    const typir = new Typir();
    const primitiveKind = new PrimitiveKind(typir);
    const functionKind = new FunctionKind(typir);
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
    const opAddSubMulDiv = operators.createBinaryOperator(['+', '-', '*', '/'], typeNumber, typeNumber,
        (node, name) => isBinaryExpression(node) && node.operator === name,
        (node) => [(node as BinaryExpression).left, (node as BinaryExpression).right]); // TODO combine both by having only one function with two different return properties?

    // binary operators: numbers => boolean
    const opLtLeqGtGeq = operators.createBinaryOperator(['<', '<=', '>', '>='], typeNumber, typeBool,
        (node, name) => isBinaryExpression(node) && node.operator === name,
        (node) => [(node as BinaryExpression).left, (node as BinaryExpression).right]);

    // binary operators: booleans => boolean
    const opAndOr = operators.createBinaryOperator(['and', 'or'], typeBool, typeBool,
        (node, name) => isBinaryExpression(node) && node.operator === name,
        (node, name) => [(node as BinaryExpression).left, (node as BinaryExpression).right]);

    // ==, != for booleans and numbers
    const opEqNeq = operators.createBinaryOperator(['==', '!='], [typeNumber, typeBool], typeBool,
        (node, name) => isBinaryExpression(node) && node.operator === name,
        (node) => [(node as BinaryExpression).left, (node as BinaryExpression).right]);

    // unary operators
    // const opNot = operators.createUnaryOperator<AstNode, UnaryExpression>('!', typeBool,
    //     isUnaryExpression, // works! => use this as an additional parameter for the Langium binding!
    //     (node) => node.value);
    const opNot = operators.createUnaryOperator('!', typeBool,
        (node) => isUnaryExpression(node) && node.operator === '!',
        (node) => (node as UnaryExpression).value);
    const opNegative = operators.createUnaryOperator('-', typeNumber,
        (node) => isUnaryExpression(node) && node.operator === '-',
        (node) => (node as UnaryExpression).value);

    // function types of FunctionDeclarations: they have to be updated after each change of the Langium document!
    AstUtils.streamAllContents(nodeRoot).forEach(node => {
        if (isFunctionDeclaration(node)) {
            const functionName = node.name;
            // define function type
            const typeFunction = functionKind.createFunctionType(
                functionName,
                { name: FUNCTION_MISSING_NAME, type: mapType(node.returnType) },
                node.parameters.map(p => { return { name: p.name, type: mapType(p.type) }; }),
                // inference rule for function declarations:
                (domainElement) => isFunctionDeclaration(domainElement) && domainElement.name === functionName, // TODO what about overloaded functions?
                // inference rule for funtion calls: inferring works only, if the actual arguments have the expected types!
                (domainElement) => isMemberCall(domainElement) && isFunctionDeclaration(domainElement.element.ref) ? [...domainElement.arguments] : false
            );
        }
    });

    // additional inference rule for member calls
    typir.inference.addInferenceRule({
        isRuleApplicable(domainElement) {
            if (isMemberCall(domainElement)) {
                const ref = domainElement.element.ref;
                if (isVariableDeclaration(ref)) {
                    // use variables inside expressions!
                    return mapType(ref.type);
                } else if (isParameter(ref)) {
                    // required to use parameters inside expressions
                    return mapType(ref.type);
                } else if (isFunctionDeclaration(ref)) {
                    // there is already an inference rule for function calls (see above for FunctionDeclaration)!
                    return false;
                } else {
                    throw new Error();
                }
            }
            return false;
        },
    });

    return typir;
}
