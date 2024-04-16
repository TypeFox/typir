/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
******************************************************************************/

/* eslint-disable @typescript-eslint/no-unused-vars */
import { AstNode, AstUtils, assertUnreachable } from 'langium';
import { FUNCTION_MISSING_NAME, FunctionKind, PrimitiveKind, Type, Typir } from 'typir';
import { TypeReference, isBinaryExpression, isBooleanExpression, isFunctionDeclaration, isMemberCall, isNumberExpression, isOxProgram, isParameter, isUnaryExpression, isVariableDeclaration } from './generated/ast.js';

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
        (node, name) => isBinaryExpression(node) && node.operator === name ? [node.left, node.right] : false);

    // binary operators: numbers => boolean
    const opLtLeqGtGeq = operators.createBinaryOperator(['<', '<=', '>', '>='], typeNumber, typeBool,
        (node, name) => isBinaryExpression(node) && node.operator === name ? [node.left, node.right] : false);

    // binary operators: booleans => boolean
    const opAndOr = operators.createBinaryOperator(['and', 'or'], typeBool, typeBool,
        (node, name) => isBinaryExpression(node) && node.operator === name ? [node.left, node.right] : false);

    // ==, != for booleans and numbers
    const opEqNeq = operators.createBinaryOperator(['==', '!='], [typeNumber, typeBool], typeBool,
        (node, name) => isBinaryExpression(node) && node.operator === name ? [node.left, node.right] : false);

    // unary operators
    const opNot = operators.createUnaryOperator('!', typeBool,
        (node) => isUnaryExpression(node) && node.operator === '!' ? node.value : false);
    const opNegative = operators.createUnaryOperator('-', typeNumber,
        (node) => isUnaryExpression(node) && node.operator === '-' ? node.value : false);

    // function types: they have to be updated after each change of the Langium document, since they are derived from FunctionDeclarations!
    AstUtils.streamAllContents(nodeRoot).forEach(node => {
        if (isFunctionDeclaration(node)) {
            const functionName = node.name;
            // define function type
            const typeFunction = functionKind.createFunctionType(
                functionName,
                // return type:
                { name: FUNCTION_MISSING_NAME, type: mapType(node.returnType) },
                // input types:
                node.parameters.map(p => ({ name: p.name, type: mapType(p.type) })),
                // inference rule for function declaration:
                (domainElement) => isFunctionDeclaration(domainElement) && domainElement.name === functionName, // TODO what about overloaded functions?
                // inference rule for funtion calls: inferring works only, if the actual arguments have the expected types!
                (domainElement) => isMemberCall(domainElement) && isFunctionDeclaration(domainElement.element.ref) && domainElement.element.ref.name === functionName
                    ? [...domainElement.arguments] : false
            );
        }
    });

    // additional inference rules for member calls
    typir.inference.addInferenceRule({
        isRuleApplicable(domainElement) {
            if (isMemberCall(domainElement)) {
                const ref = domainElement.element.ref;
                if (isVariableDeclaration(ref)) {
                    // use variables inside expressions!
                    return mapType(ref.type);
                } else if (isParameter(ref)) {
                    // use parameters inside expressions
                    return mapType(ref.type);
                } else if (isFunctionDeclaration(ref)) {
                    // there is already an inference rule for function calls (see above for FunctionDeclaration)!
                    return 'RULE_NOT_APPLICABLE';
                } else if (ref === undefined) {
                    return 'RULE_NOT_APPLICABLE';
                } else {
                    assertUnreachable(ref);
                }
            }
            return 'RULE_NOT_APPLICABLE';
        },
    });

    return typir;
}
