/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
******************************************************************************/

import { AstNode, AstUtils, assertUnreachable, isAstNode } from 'langium';
import { ClassKind, DefaultTypeConflictPrinter, FUNCTION_MISSING_NAME, FunctionKind, InferOperatorWithMultipleOperands, InferOperatorWithSingleOperand, PrimitiveKind, Type, Typir } from 'typir';
import { BinaryExpression, TypeReference, UnaryExpression, isBinaryExpression, isBooleanExpression, isClass, isClassMember, isForStatement, isFunctionDeclaration, isIfStatement, isLoxProgram, isMemberCall, isMethodMember, isNumberExpression, isParameter, isReturnStatement, isStringExpression, isTypeReference, isUnaryExpression, isVariableDeclaration, isWhileStatement } from '../generated/ast.js';

export function createTypir(domainNodeEntry: AstNode): Typir {
    const domainNodeRoot = AstUtils.getContainerOfType(domainNodeEntry, isLoxProgram)!;

    // set up Typir and reuse some predefined things
    const typir = new Typir();
    const primitiveKind = new PrimitiveKind(typir);
    const functionKind = new FunctionKind(typir);
    const classKind = new ClassKind(typir);
    const operators = typir.operators;

    // types
    // typeBool, typeNumber and typeVoid are specific types for OX, ...
    const typeBool = primitiveKind.createPrimitiveType({ primitiveName: 'boolean', inferenceRule: (node) => isBooleanExpression(node)});
    // ... but their primitive kind is provided/preset by Typir
    const typeNumber = primitiveKind.createPrimitiveType({ primitiveName: 'number', inferenceRule: (node) => isNumberExpression(node)});
    const typeString = primitiveKind.createPrimitiveType({ primitiveName: 'string', inferenceRule: node => isStringExpression(node) });
    const typeVoid = primitiveKind.createPrimitiveType({ primitiveName: 'void' });

    // utility function to map language types to Typir types
    function mapType(typeRef: TypeReference): Type {
        if(typeRef.primitive) {
            switch (typeRef.primitive) {
                case 'number': return typeNumber;
                case 'string': return typeString;
                case 'boolean': return typeBool;
                case 'void': return typeVoid;
                default: assertUnreachable(typeRef.primitive);
            }
        } else if(typeRef.reference && typeRef.reference.ref) {
            const klass = typeRef.reference.ref;
            return classKind.createClassType({ 
                className: klass.name,
                fields: undefined!
            });
        } else {
            return functionKind.createFunctionType(undefined!)
        }
    }

    const binaryInferenceRule: InferOperatorWithMultipleOperands<BinaryExpression> = {
        filter: isBinaryExpression,
        matching: (node, name) => node.operator === name,
        operands: (node, _name) => [node.left, node.right],
    };
    const unaryInferenceRule: InferOperatorWithSingleOperand<UnaryExpression> = {
        filter: isUnaryExpression,
        matching: (node, name) => node.operator === name,
        operand: (node, _name) => node.value,
    };

    // binary operators: numbers => number
    operators.createBinaryOperator({ name: ['+', '-', '*', '/'], inputType: typeNumber, outputType: typeNumber, inferenceRule: binaryInferenceRule });

    // binary operators: numbers => boolean
    operators.createBinaryOperator({ name: ['<', '<=', '>', '>='], inputType: typeNumber, outputType: typeBool, inferenceRule: binaryInferenceRule });

    // binary operators: booleans => boolean
    operators.createBinaryOperator({ name: ['and', 'or'], inputType: typeBool, outputType: typeBool, inferenceRule: binaryInferenceRule });

    // ==, != for booleans and numbers
    operators.createBinaryOperator({ name: ['==', '!='], inputType: [typeNumber, typeBool], outputType: typeBool, inferenceRule: binaryInferenceRule });

    // unary operators
    operators.createUnaryOperator({ name: '!', operandType: typeBool, inferenceRule: unaryInferenceRule });
    operators.createUnaryOperator({ name: '-', operandType: typeNumber, inferenceRule: unaryInferenceRule });

    // function types: they have to be updated after each change of the Langium document, since they are derived from FunctionDeclarations!
    AstUtils.streamAllContents(domainNodeRoot).forEach((node: AstNode) => {
        if (isFunctionDeclaration(node)) {
            const functionName = node.name;
            // define function type
            functionKind.createFunctionType({
                functionName,
                outputParameter: { name: FUNCTION_MISSING_NAME, type: mapType(node.returnType) },
                inputParameters: node.parameters.map(p => ({ name: p.name, type: mapType(p.type) })),
                // inference rule for function declaration:
                inferenceRuleForDeclaration: (domainElement) => domainElement === node, // only the current function declaration matches!
                /** inference rule for funtion calls:
                 * - inferring of overloaded functions works only, if the actual arguments have the expected types!
                 * - (inferring calls to non-overloaded functions works independently from the types of the given parameters)
                 * - additionally, validations for the assigned values to the expected parameter( type)s are derived */
                inferenceRuleForCalls: {
                    filter: isMemberCall,
                    matching: (domainElement) => isFunctionDeclaration(domainElement.element?.ref) && domainElement.element!.ref.name === functionName,
                    inputArguments: (domainElement) => domainElement.arguments
                },
            });
        }
    });

    // additional inference rules for ...
    typir.inference.addInferenceRule({
        isRuleApplicable(domainElement) {
            // ... member calls
            if (isMemberCall(domainElement)) {
                const ref = domainElement.element!.ref;
                if (isClass(ref)) {
                    return undefined!; //TODO
                } else if (isClassMember(ref)) {
                    return undefined!; //TODO
                } else if (isMethodMember(ref)) {
                    return undefined!; //TODO
                } else if (isVariableDeclaration(ref)) {
                    // use variables inside expressions!
                    return mapType(ref.type!);
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
            // ... variable declarations
            if (isVariableDeclaration(domainElement)) {
                return mapType(domainElement.type!);
            }
            // ... language types
            if (isTypeReference(domainElement)) {
                return mapType(domainElement);
            }
            return 'RULE_NOT_APPLICABLE';
        },
    });

    // some explicit validations for typing issues with Typir (replaces corresponding functions in the OxValidator!)
    typir.validation.collector.addValidationRules(
        (node: unknown, typir: Typir) => {
            if (isIfStatement(node) || isWhileStatement(node) || isForStatement(node)) {
                return typir.validation.constraints.ensureNodeIsAssignable(node.condition, typeBool, "Conditions need to be evaluated to 'boolean'.", 'condition');
            }
            if (isVariableDeclaration(node)) {
                return [
                    ...typir.validation.constraints.ensureNodeHasNotType(node, typeVoid, "Variable can't be declared with a type 'void'.", 'type'),
                    ...typir.validation.constraints.ensureNodeIsAssignable(node.value, node, `The expression '${node.value?.$cstNode?.text}' is not assignable to '${node.name}'`, 'value')
                ];
            }
            if (isBinaryExpression(node) && node.operator === '=' && node.left) {
                return typir.validation.constraints.ensureNodeIsAssignable(node.right, node.left, `The expression '${node.right.$cstNode?.text}' is not assignable to '${node.left.$cstNode?.text}'`, 'value');
            }
            if (isReturnStatement(node)) {
                const functionDeclaration = AstUtils.getContainerOfType(node, isFunctionDeclaration);
                if (functionDeclaration && functionDeclaration.returnType.primitive !== 'void' && node.value) {
                    // the return value must fit to the return type of the function
                    return typir.validation.constraints.ensureNodeIsAssignable(node.value, functionDeclaration.returnType, `The expression '${node.value.$cstNode?.text}' is not usable as return value for the function '${functionDeclaration.name}'`, 'value');
                }
            }
            return [];
        }
    );

    // override some default behaviour ...
    // ... print the text of the corresponding CstNode
    class OxPrinter extends DefaultTypeConflictPrinter {
        protected override printDomainElement(domainElement: unknown, sentenceBegin?: boolean | undefined): string {
            if (isAstNode(domainElement)) {
                return `${sentenceBegin ? 'T' : 't'}he AstNode '${domainElement.$cstNode?.text}'`;
            }
            return super.printDomainElement(domainElement, sentenceBegin);
        }
    }
    typir.printer = new OxPrinter(typir);

    return typir;
}
