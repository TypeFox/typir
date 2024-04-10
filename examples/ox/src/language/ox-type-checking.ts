/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
******************************************************************************/

/* eslint-disable @typescript-eslint/no-unused-vars */
import { AstNode, AstUtils, assertUnreachable } from 'langium';
import { FUNCTION_MISSING_NAME, FunctionKind, NameTypePair, PrimitiveKind, Type, Typir, assertTrue, isFunctionKind } from 'typir';
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

    // const ref: (kind: unknown) => kind is FunctionKind = isFunctionKind; // TODO diese Signatur irgendwie nutzen, ggfs. nur bei/für Langium?

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

    // TODO FunctionDeclaration: ist das überhaupt nötig? muss bei jeder Änderung des Dokuments aktualisiert werden! damit function calls type checken der Arguments?
    AstUtils.streamAllContents(nodeRoot).forEach(node => {
        if (isFunctionDeclaration(node)) {
            const functionName = node.name;
            // define function type
            const typeFunction = functionKind.createFunctionType(functionName,
                { name: FUNCTION_MISSING_NAME, type: mapType(node.returnType) },
                ...node.parameters.map(p => { return { name: p.name, type: mapType(p.type) }; })
            );
            // ... and register a corresponding inference rule for it
            typir.inference.addInferenceRule({
                isRuleApplicable(domainElement) {
                    if (isFunctionDeclaration(domainElement) && domainElement.name === functionName) {
                        return typeFunction;
                    }
                    return false;
                },
            });
        }
    });

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
                    return [...domainElement.arguments]; // inferring works only, if the actual arguments have to expected types!
                    // return mapType(ref.returnType); // this returns the expected types, but ignores the actual types
                    // TODO check assigning values to parameters VS inferring the type of the function itself => intermixed?? (Vorsicht mit überladenen Funktionen!)
                } else {
                    throw new Error();
                }
            }
            return false;
        },
        // TODO inference rule in functionKind unterstützen, dadurch auch Operators vereinfachen!
        inferType(domainElement, childrenTypes) {
            if (isMemberCall(domainElement) && isFunctionDeclaration(domainElement.element.ref)) {
                // check the types of the arguments for the current function call!
                const functionDeclaration = domainElement.element.ref;
                if (functionDeclaration.parameters.length !== childrenTypes.length) {
                    return undefined;
                }
                for (let index = 0; index < functionDeclaration.parameters.length; index++) {
                    const actualType = childrenTypes[index];
                    const expectedType = mapType(functionDeclaration.parameters[index].type);
                    if (!actualType || !expectedType || typir.equality.areTypesEqual(actualType, expectedType).length >= 1) {
                        // missing actual types leed to a mismatch!
                        return undefined;
                    }
                }
                // all operands have the required types => return the return type of the function
                return mapType(functionDeclaration.returnType); // dies ist nur eine Abkürzung!
                // return functionKind!.getOutput(newOperatorType)?.type; // TODO dies ist eigentlich schöner und muss auch irgendwie funktionieren
            }
            throw new Error('this case should not happen');
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
