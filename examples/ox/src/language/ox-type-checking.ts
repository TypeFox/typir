/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
******************************************************************************/

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
    // typeBool is a specific type for OX, ...
    const typeBool = primitiveKind.createPrimitiveType({ primitiveName: 'boolean', inferenceRule: (node) => isBooleanExpression(node)});
    // but the primitive kind is provided/preset by Typir
    const typeNumber = primitiveKind.createPrimitiveType({ primitiveName: 'number', inferenceRule: (node) => isNumberExpression(node)});
    const typeVoid = primitiveKind.createPrimitiveType({ primitiveName: 'void' });

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
    operators.createBinaryOperator({ name: ['+', '-', '*', '/'], inputType: typeNumber, outputType: typeNumber,
        inferenceRule: (node, name) => isBinaryExpression(node) && node.operator === name ? [node.left, node.right] : false});

    // binary operators: numbers => boolean
    operators.createBinaryOperator({ name: ['<', '<=', '>', '>='], inputType: typeNumber, outputType: typeBool,
        inferenceRule: (node, name) => isBinaryExpression(node) && node.operator === name ? [node.left, node.right] : false});

    // binary operators: booleans => boolean
    operators.createBinaryOperator({ name: ['and', 'or'], inputType: typeBool, outputType: typeBool,
        inferenceRule: (node, name) => isBinaryExpression(node) && node.operator === name ? [node.left, node.right] : false});

    // ==, != for booleans and numbers
    operators.createBinaryOperator({ name: ['==', '!='], inputType: [typeNumber, typeBool], outputType: typeBool,
        inferenceRule: (node, name) => isBinaryExpression(node) && node.operator === name ? [node.left, node.right] : false});

    // unary operators
    operators.createUnaryOperator({ name: '!', operandType: typeBool,
        inferenceRule: (node) => isUnaryExpression(node) && node.operator === '!' ? node.value : false});
    operators.createUnaryOperator({ name: '-', operandType: typeNumber,
        inferenceRule: (node) => isUnaryExpression(node) && node.operator === '-' ? node.value : false});

    // function types: they have to be updated after each change of the Langium document, since they are derived from FunctionDeclarations!
    AstUtils.streamAllContents(nodeRoot).forEach(node => {
        if (isFunctionDeclaration(node)) {
            const functionName = node.name;
            // define function type
            functionKind.createFunctionType({
                functionName,
                outputParameter: { name: FUNCTION_MISSING_NAME, type: mapType(node.returnType) },
                inputParameters: node.parameters.map(p => ({ name: p.name, type: mapType(p.type) })),
                // inference rule for function declaration:
                inferenceRuleForDeclaration: (domainElement) => isFunctionDeclaration(domainElement) && domainElement.name === functionName, // TODO what about overloaded functions?
                // inference rule for funtion calls: inferring works only, if the actual arguments have the expected types!
                inferenceRuleForCalls: (domainElement) =>
                    isMemberCall(domainElement) && isFunctionDeclaration(domainElement.element.ref) && domainElement.element.ref.name === functionName
                        ? [...domainElement.arguments]
                        : false
            });
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
