/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
******************************************************************************/

import { AstNode, AstUtils, LangiumSharedCoreServices, Module, assertUnreachable } from 'langium';
import { CreateParameterDetails, InferOperatorWithMultipleOperands, InferOperatorWithSingleOperand, InferenceRuleNotApplicable, NO_PARAMETER_NAME, TypirServices } from 'typir';
import { AbstractLangiumTypeCreator, LangiumLanguageService, LangiumServicesForTypirBinding, PartialTypirLangiumServices } from 'typir-langium';
import { ValidationProblemAcceptor } from '../../../../packages/typir/lib/services/validation.js';
import { BinaryExpression, ForStatement, FunctionDeclaration, IfStatement, MemberCall, NumberLiteral, OxAstType, TypeReference, UnaryExpression, WhileStatement, isBinaryExpression, isBooleanLiteral, isFunctionDeclaration, isParameter, isTypeReference, isUnaryExpression, isVariableDeclaration, reflection } from './generated/ast.js';

export class OxTypeCreator extends AbstractLangiumTypeCreator {
    protected readonly typir: LangiumServicesForTypirBinding;

    constructor(typirServices: LangiumServicesForTypirBinding, langiumServices: LangiumSharedCoreServices) {
        super(typirServices, langiumServices);
        this.typir = typirServices;
    }

    onInitialize(): void {
        // define primitive types
        // typeBool, typeNumber and typeVoid are specific types for OX, ...
        const typeBool = this.typir.factory.Primitives.create({ primitiveName: 'boolean' })
            .inferenceRule({ filter: isBooleanLiteral })
            .inferenceRule({ filter: isTypeReference, matching: node => node.primitive === 'boolean' })
            .finish();
        // ... but their primitive kind is provided/preset by Typir
        const typeNumber = this.typir.factory.Primitives.create({ primitiveName: 'number' })
            .inferenceRule({ languageKey: NumberLiteral })
            .inferenceRule({ languageKey: TypeReference, matching: (node: TypeReference) => node.primitive === 'number' })
            .finish();
        const typeVoid = this.typir.factory.Primitives.create({ primitiveName: 'void' })
            .inferenceRule({ languageKey: TypeReference, matching: (node: TypeReference) => node.primitive === 'void' })
            .finish();

        // extract inference rules, which is possible here thanks to the unified structure of the Langium grammar (but this is not possible in general!)
        const binaryInferenceRule: InferOperatorWithMultipleOperands<AstNode, BinaryExpression> = {
            filter: isBinaryExpression,
            matching: (node: BinaryExpression, name: string) => node.operator === name,
            operands: (node: BinaryExpression, _name: string) => [node.left, node.right],
            validateArgumentsOfCalls: true,
        };
        const unaryInferenceRule: InferOperatorWithSingleOperand<AstNode, UnaryExpression> = {
            filter: isUnaryExpression,
            matching: (node: UnaryExpression, name: string) => node.operator === name,
            operand: (node: UnaryExpression, _name: string) => node.value,
            validateArgumentsOfCalls: true,
        };

        // define operators
        // binary operators: numbers => number
        for (const operator of ['+', '-', '*', '/']) {
            this.typir.factory.Operators.createBinary({ name: operator, signature: { left: typeNumber, right: typeNumber, return: typeNumber }}).inferenceRule(binaryInferenceRule).finish();
        }
        // TODO better name for "inferenceRule": astSelectors
        // binary operators: numbers => boolean
        for (const operator of ['<', '<=', '>', '>=']) {
            this.typir.factory.Operators.createBinary({ name: operator, signature: { left: typeNumber, right: typeNumber, return: typeBool }}).inferenceRule(binaryInferenceRule).finish();
        }
        // binary operators: booleans => boolean
        for (const operator of ['and', 'or']) {
            this.typir.factory.Operators.createBinary({ name: operator, signature: { left: typeBool, right: typeBool, return: typeBool }}).inferenceRule(binaryInferenceRule).finish();
        }
        // ==, != for booleans and numbers
        for (const operator of ['==', '!=']) {
            this.typir.factory.Operators.createBinary({ name: operator, signatures: [
                { left: typeNumber, right: typeNumber, return: typeBool },
                { left: typeBool, right: typeBool, return: typeBool },
            ]}).inferenceRule(binaryInferenceRule).finish();
        }

        // unary operators
        this.typir.factory.Operators.createUnary({ name: '!', signature: { operand: typeBool, return: typeBool }}).inferenceRule(unaryInferenceRule).finish();
        this.typir.factory.Operators.createUnary({ name: '-', signature: { operand: typeNumber, return: typeNumber }}).inferenceRule(unaryInferenceRule).finish();

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
        this.typir.Inference.addInferenceRulesForAstNodes<OxAstType>({
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
        this.typir.validation.Collector.addValidationRulesForAstNodes<OxAstType>({
            AssignmentStatement: (node, accept, typir) => {
                if (node.varRef.ref) {
                    typir.validation.Constraints.ensureNodeIsAssignable(node.value, node.varRef.ref, accept,
                        (actual, expected) => ({
                            message: `The expression '${node.value.$cstNode?.text}' of type '${actual.name}' is not assignable to the variable '${node.varRef.ref!.name}' with type '${expected.name}'.`,
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
                        () => ({ message: `The expression '${node.value!.$cstNode?.text}' is not usable as return value for the function '${functionDeclaration.name}'.`, languageProperty: 'value' }));
                }
            },
            VariableDeclaration: (node, accept, typir) => {
                typir.validation.Constraints.ensureNodeHasNotType(node, typeVoid, accept,
                    () => ({ message: "Variables can't be declared with the type 'void'.", languageProperty: 'type' }));
                typir.validation.Constraints.ensureNodeIsAssignable(node.value, node, accept,
                    (actual, expected) => ({ message: `The initialization expression '${node.value?.$cstNode?.text}' of type '${actual.name}' is not assignable to the variable '${node.name}' with type '${expected.name}'.`, languageProperty: 'value' }));
            },
            WhileStatement: validateCondition,
        });
        function validateCondition(node: IfStatement | WhileStatement | ForStatement, accept: ValidationProblemAcceptor<AstNode>, typir: TypirServices<AstNode>): void {
            typir.validation.Constraints.ensureNodeIsAssignable(node.condition, typeBool, accept,
                () => ({ message: "Conditions need to be evaluated to 'boolean'.", languageProperty: 'condition' }));
        }
    }

    onNewAstNode(languageNode: AstNode): void {
        // define function types
        // they have to be updated after each change of the Langium document, since they are derived from the user-defined FunctionDeclarations!
        if (isFunctionDeclaration(languageNode)) {
            const functionName = languageNode.name;
            // define function type
            this.typir.factory.Functions.create({
                functionName,
                // note that the following two lines internally use type inference here in order to map language types to Typir types
                outputParameter: { name: NO_PARAMETER_NAME, type: languageNode.returnType },
                inputParameters: languageNode.parameters.map(p => (<CreateParameterDetails<AstNode>>{ name: p.name, type: p.type })),
                associatedLanguageNode: languageNode,
            })
                // inference rule for function declaration:
                .inferenceRuleForDeclaration({
                    languageKey: FunctionDeclaration,
                    matching: (node: FunctionDeclaration) => node === languageNode // only the current function declaration matches!
                })
                /** inference rule for funtion calls:
                 * - inferring of overloaded functions works only, if the actual arguments have the expected types!
                 * - (inferring calls to non-overloaded functions works independently from the types of the given parameters)
                 * - additionally, validations for the assigned values to the expected parameter( type)s are derived */
                .inferenceRuleForCalls({
                    languageKey: MemberCall,
                    matching: (call: MemberCall) => isFunctionDeclaration(call.element.ref) && call.explicitOperationCall && call.element.ref.name === functionName,
                    inputArguments: (call: MemberCall) => call.arguments, // they are needed to check, that the given arguments are assignable to the parameters
                    // Note that OX does not support overloaded function declarations for simplicity: Look into LOX to see how to handle overloaded functions and methods!
                    validateArgumentsOfFunctionCalls: true,
                })
                .finish();
        }
    }
}


export function createOxTypirModule(langiumServices: LangiumSharedCoreServices): Module<LangiumServicesForTypirBinding, PartialTypirLangiumServices> {
    return {
        // specific configurations for OX
        TypeCreator: (typirServices) => new OxTypeCreator(typirServices, langiumServices), // specify the type system for OX
        Language: () => new LangiumLanguageService(reflection), // tell Typir-Langium something about the LX implementation with Langium
    };
}
