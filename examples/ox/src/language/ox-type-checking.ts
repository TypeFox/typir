/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
******************************************************************************/

import { AstNode, AstUtils, assertUnreachable } from 'langium';
import { CreateParameterDetails, InferOperatorWithMultipleOperands, InferOperatorWithSingleOperand, InferenceRuleNotApplicable, NO_PARAMETER_NAME, TypirServices, ValidationProblemAcceptor } from 'typir';
import { LangiumTypeSystemDefinition, TypirLangiumServices, TypirLangiumSpecifics } from 'typir-langium';
import { BinaryExpression, ForStatement, FunctionDeclaration, IfStatement, MemberCall, NumberLiteral, OxAstType, TypeReference, UnaryExpression, WhileStatement, isBinaryExpression, isBooleanLiteral, isFunctionDeclaration, isParameter, isTypeReference, isUnaryExpression, isVariableDeclaration } from './generated/ast.js';

export interface OxSpecifics extends TypirLangiumSpecifics { // concretize some OX-specifics here
    LanguageKeys: OxAstType; // all AST types from the generated `ast.ts`
}

export class OxTypeSystem implements LangiumTypeSystemDefinition<OxSpecifics> {

    onInitialize(typir: TypirLangiumServices<OxSpecifics>): void {
        // define primitive types
        // typeBool, typeNumber and typeVoid are specific types for OX, ...
        const typeBool = typir.factory.Primitives.create({ primitiveName: 'boolean' })
            .inferenceRule({ filter: isBooleanLiteral })
            .inferenceRule({ filter: isTypeReference, matching: node => node.primitive === 'boolean' })
            .finish();
        // ... but their primitive kind is provided/preset by Typir
        const typeNumber = typir.factory.Primitives.create({ primitiveName: 'number' })
            .inferenceRule({ languageKey: NumberLiteral.$type })
            .inferenceRule({ languageKey: TypeReference.$type, matching: node => node.primitive === 'number' })
            .finish();
        const typeVoid = typir.factory.Primitives.create({ primitiveName: 'void' })
            .inferenceRule({ languageKey: TypeReference.$type, matching: node => node.primitive === 'void' })
            .finish();

        // extract inference rules, which is possible here thanks to the unified structure of the Langium grammar (but this is not possible in general!)
        const binaryInferenceRule: InferOperatorWithMultipleOperands<OxSpecifics, BinaryExpression> = {
            filter: isBinaryExpression,
            matching: (node: BinaryExpression, name: string) => node.operator === name,
            operands: (node: BinaryExpression, _name: string) => [node.left, node.right],
            validateArgumentsOfCalls: true,
        };
        const unaryInferenceRule: InferOperatorWithSingleOperand<OxSpecifics, UnaryExpression> = {
            filter: isUnaryExpression,
            matching: (node: UnaryExpression, name: string) => node.operator === name,
            operand: (node: UnaryExpression, _name: string) => node.value,
            validateArgumentsOfCalls: true,
        };

        // define operators
        // binary operators: numbers => number
        for (const operator of ['+', '-', '*', '/']) {
            typir.factory.Operators.createBinary({ name: operator, signature: { left: typeNumber, right: typeNumber, return: typeNumber }}).inferenceRule(binaryInferenceRule).finish();
        }
        // binary operators: numbers => boolean
        for (const operator of ['<', '<=', '>', '>=']) {
            typir.factory.Operators.createBinary({ name: operator, signature: { left: typeNumber, right: typeNumber, return: typeBool }}).inferenceRule(binaryInferenceRule).finish();
        }
        // binary operators: booleans => boolean
        for (const operator of ['and', 'or']) {
            typir.factory.Operators.createBinary({ name: operator, signature: { left: typeBool, right: typeBool, return: typeBool }}).inferenceRule(binaryInferenceRule).finish();
        }
        // ==, != for booleans and numbers
        for (const operator of ['==', '!=']) {
            typir.factory.Operators.createBinary({ name: operator, signatures: [
                { left: typeNumber, right: typeNumber, return: typeBool },
                { left: typeBool, right: typeBool, return: typeBool },
            ]}).inferenceRule(binaryInferenceRule).finish();
        }

        // unary operators
        typir.factory.Operators.createUnary({ name: '!', signature: { operand: typeBool, return: typeBool }}).inferenceRule(unaryInferenceRule).finish();
        typir.factory.Operators.createUnary({ name: '-', signature: { operand: typeNumber, return: typeNumber }}).inferenceRule(unaryInferenceRule).finish();

        /** Hints regarding the order of Typir configurations for OX:
         * - In general, Typir aims to not depend on the order of configurations.
         *   (Beyond some obvious things, e.g. created Type instances can be used only afterwards and not before their creation.)
         * - But at the moment, this objective is not reached in general!
         * - As an example, since the function definition above uses type inference for their parameter types, it is necessary,
         *   that the primitive types and their corresponding inference rules are defined earlier!
         * - In the future, the user of Typir will not need to do a topological sorting of type definitions anymore,
         *   since the type definition process will be split and parts will be delayed.
         * - The following inference rules are OK, since they are not relevant for defining function types
         */

        // additional inference rules ...
        typir.Inference.addInferenceRulesForLanguageNodes({
            // ... for member calls (which are used in expressions)
            MemberCall: (languageNode) => {
                const ref = languageNode.element.ref;
                if (isVariableDeclaration(ref)) {
                    // use variables inside expressions!
                    return ref;
                } else if (isParameter(ref)) {
                    // use parameters inside expressions
                    return ref.type;
                } else if (isFunctionDeclaration(ref)) {
                    // there is already an inference rule for function calls (see below for FunctionDeclaration)!
                    return InferenceRuleNotApplicable;
                } else if (ref === undefined) {
                    return InferenceRuleNotApplicable;
                } else {
                    assertUnreachable(ref);
                }
            },
            // ... variable declarations
            VariableDeclaration: (languageNode) => {
                if (languageNode.type) {
                    // the user declared this variable with a type
                    return languageNode.type;
                } else if (languageNode.value) {
                    // the didn't declared a type for this variable => do type inference of the assigned value instead!
                    return languageNode.value;
                } else {
                    return InferenceRuleNotApplicable; // this case is impossible, there is a validation in the Langium LOX validator for this case
                }
            },
        });

        // explicit validations for typing issues, realized with Typir (which replaced corresponding functions in the OxValidator!)
        typir.validation.Collector.addValidationRulesForLanguageNodes({
            AssignmentStatement: (node, accept, typir) => {
                if (node.varRef.ref) {
                    typir.validation.Constraints.ensureNodeIsAssignable(node.value, node.varRef.ref, accept,
                        (actual, expected) => ({
                            message: `The expression '${node.value.$cstNode?.text}' of type '${actual.name}' is not assignable to the variable '${node.varRef.ref!.name}' with type '${expected.name}'.`,
                            languageNode: node,
                            languageProperty: 'value',
                        }));
                }
            },
            ForStatement: validateCondition,
            IfStatement: validateCondition,
            ReturnStatement: (node, accept, typir) => {
                const functionDeclaration = AstUtils.getContainerOfType(node, isFunctionDeclaration);
                if (functionDeclaration && functionDeclaration.returnType.primitive !== 'void' && node.value) {
                    // the return value must fit to the return type of the function
                    typir.validation.Constraints.ensureNodeIsAssignable(node.value, functionDeclaration.returnType, accept,
                        () => ({ message: `The expression '${node.value!.$cstNode?.text}' is not usable as return value for the function '${functionDeclaration.name}'.`, languageNode: node, languageProperty: 'value' }));
                }
            },
            VariableDeclaration: (node, accept, typir) => {
                typir.validation.Constraints.ensureNodeHasNotType(node, typeVoid, accept,
                    () => ({ message: "Variables can't be declared with the type 'void'.", languageNode: node, languageProperty: 'type' }));
                typir.validation.Constraints.ensureNodeIsAssignable(node.value, node, accept,
                    (actual, expected) => ({ message: `The initialization expression '${node.value?.$cstNode?.text}' of type '${actual.name}' is not assignable to the variable '${node.name}' with type '${expected.name}'.`, languageNode: node, languageProperty: 'value' }));
            },
            WhileStatement: validateCondition,
        });
        function validateCondition(node: IfStatement | WhileStatement | ForStatement, accept: ValidationProblemAcceptor<OxSpecifics>, typir: TypirServices<OxSpecifics>): void {
            typir.validation.Constraints.ensureNodeIsAssignable(node.condition, typeBool, accept,
                () => ({ message: "Conditions need to be evaluated to 'boolean'.", languageNode: node, languageProperty: 'condition' }));
        }
    }

    onNewAstNode(languageNode: AstNode, typir: TypirLangiumServices<OxSpecifics>): void {
        // define function types
        // they have to be updated after each change of the Langium document, since they are derived from the user-defined FunctionDeclarations!
        if (isFunctionDeclaration(languageNode)) {
            const functionName = languageNode.name;
            // define function type
            typir.factory.Functions.create({
                functionName,
                // note that the following two lines internally use type inference here in order to map language types to Typir types
                outputParameter: { name: NO_PARAMETER_NAME, type: languageNode.returnType },
                inputParameters: languageNode.parameters.map(p => (<CreateParameterDetails<OxSpecifics>>{ name: p.name, type: p.type })),
                associatedLanguageNode: languageNode,
            })
                // inference rule for function declaration:
                .inferenceRuleForDeclaration({
                    languageKey: FunctionDeclaration.$type,
                    matching: node => node === languageNode, // only the current function declaration matches!
                })
                /** inference rule for funtion calls:
                 * - inferring of overloaded functions works only, if the actual arguments have the expected types!
                 * - (inferring calls to non-overloaded functions works independently from the types of the given parameters)
                 * - additionally, validations for the assigned values to the expected parameter( type)s are derived */
                .inferenceRuleForCalls({
                    languageKey: MemberCall.$type,
                    matching: call => isFunctionDeclaration(call.element.ref) && call.explicitOperationCall && call.element.ref.name === functionName,
                    inputArguments: (call: MemberCall) => call.arguments, // they are needed to check, that the given arguments are assignable to the parameters
                    // Note that OX does not support overloaded function declarations for simplicity: Look into LOX to see how to handle overloaded functions and methods!
                    validateArgumentsOfFunctionCalls: true,
                })
                .finish();
        }
    }

}
