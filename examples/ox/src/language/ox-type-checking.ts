/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
******************************************************************************/

import { AstNode, AstUtils, Module, assertUnreachable } from 'langium';
import { FUNCTION_MISSING_NAME, FunctionKind, InferOperatorWithMultipleOperands, InferOperatorWithSingleOperand, InferenceRuleNotApplicable, OperatorManager, ParameterDetails, PartialTypirServices, PrimitiveKind, TypirServices } from 'typir';
import { AbstractLangiumTypeCreator } from 'typir-langium';
import { ValidationMessageDetails } from '../../../../packages/typir/lib/features/validation.js';
import { BinaryExpression, MemberCall, UnaryExpression, isAssignmentStatement, isBinaryExpression, isBooleanLiteral, isForStatement, isFunctionDeclaration, isIfStatement, isMemberCall, isNumberLiteral, isParameter, isReturnStatement, isTypeReference, isUnaryExpression, isVariableDeclaration, isWhileStatement } from './generated/ast.js';

export class OxTypeCreator extends AbstractLangiumTypeCreator {
    protected readonly typir: TypirServices;
    protected readonly primitiveKind: PrimitiveKind;
    protected readonly functionKind: FunctionKind;
    protected readonly operators: OperatorManager;

    constructor(services: TypirServices) {
        super();
        this.typir = services;

        this.primitiveKind = new PrimitiveKind(this.typir);
        this.functionKind = new FunctionKind(this.typir);
        this.operators = this.typir.operators;
    }

    initialize(): void {
        // define primitive types
        // typeBool, typeNumber and typeVoid are specific types for OX, ...
        const typeBool = this.primitiveKind.createPrimitiveType({ primitiveName: 'boolean', inferenceRules: [
            isBooleanLiteral,
            (node: unknown) => isTypeReference(node) && node.primitive === 'boolean',
        ]});
        // ... but their primitive kind is provided/preset by Typir
        const typeNumber = this.primitiveKind.createPrimitiveType({ primitiveName: 'number', inferenceRules: [
            isNumberLiteral,
            (node: unknown) => isTypeReference(node) && node.primitive === 'number',
        ]});
        const typeVoid = this.primitiveKind.createPrimitiveType({ primitiveName: 'void', inferenceRules:
            (node: unknown) => isTypeReference(node) && node.primitive === 'void'
        });

        // extract inference rules, which is possible here thanks to the unified structure of the Langium grammar (but this is not possible in general!)
        const binaryInferenceRule: InferOperatorWithMultipleOperands<BinaryExpression> = {
            filter: isBinaryExpression,
            matching: (node: BinaryExpression, name: string) => node.operator === name,
            operands: (node: BinaryExpression, _name: string) => [node.left, node.right],
        };
        const unaryInferenceRule: InferOperatorWithSingleOperand<UnaryExpression> = {
            filter: isUnaryExpression,
            matching: (node: UnaryExpression, name: string) => node.operator === name,
            operand: (node: UnaryExpression, _name: string) => node.value,
        };

        // define operators
        // binary operators: numbers => number
        for (const operator of ['+', '-', '*', '/']) {
            this.operators.createBinaryOperator({ name: operator, signature: { left: typeNumber, right: typeNumber, return: typeNumber }, inferenceRule: binaryInferenceRule });
        }
        // TODO better name: overloads, overloadRules, selectors, signatures
        // TODO better name for "inferenceRule": astSelectors
        // binary operators: numbers => boolean
        for (const operator of ['<', '<=', '>', '>=']) {
            this.operators.createBinaryOperator({ name: operator, signature: { left: typeNumber, right: typeNumber, return: typeBool }, inferenceRule: binaryInferenceRule });
        }
        // binary operators: booleans => boolean
        for (const operator of ['and', 'or']) {
            this.operators.createBinaryOperator({ name: operator, signature: { left: typeBool, right: typeBool, return: typeBool }, inferenceRule: binaryInferenceRule });
        }
        // ==, != for booleans and numbers
        for (const operator of ['==', '!=']) {
            this.operators.createBinaryOperator({ name: operator, signature: [
                { left: typeNumber, right: typeNumber, return: typeBool },
                { left: typeBool, right: typeBool, return: typeBool },
            ], inferenceRule: binaryInferenceRule });
        }

        // unary operators
        this.operators.createUnaryOperator({ name: '!', signature: { operand: typeBool, return: typeBool }, inferenceRule: unaryInferenceRule });
        this.operators.createUnaryOperator({ name: '-', signature: { operand: typeNumber, return: typeNumber }, inferenceRule: unaryInferenceRule });

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
        this.typir.inference.addInferenceRule((domainElement: unknown) => {
            // ... for member calls (which are used in expressions)
            if (isMemberCall(domainElement)) {
                const ref = domainElement.element.ref;
                if (isVariableDeclaration(ref)) {
                    // use variables inside expressions!
                    return ref.type;
                } else if (isParameter(ref)) {
                    // use parameters inside expressions
                    return ref.type;
                } else if (isFunctionDeclaration(ref)) {
                    // there is already an inference rule for function calls (see above for FunctionDeclaration)!
                    return 'N/A'; // as an alternative: use 'InferenceRuleNotApplicable' instead, what should we recommend?
                } else if (ref === undefined) {
                    return InferenceRuleNotApplicable;
                } else {
                    assertUnreachable(ref);
                }
            }
            return InferenceRuleNotApplicable;
        });
        // it is up to the user of Typir, how to structure the inference rules!
        this.typir.inference.addInferenceRule((domainElement, _typir) => {
            // ... and for variable declarations
            if (isVariableDeclaration(domainElement)) {
                return domainElement.type;
            }
            return InferenceRuleNotApplicable;
        });
        // TODO: [<VariableDeclaration>{ selector: isVariableDeclaration, result: domainElement => domainElement.type }, <BinaryExpression>{}]      Array<InferenceRule<T>>
        // discriminator rule: $type '$VariableDeclaration' + record / "Sprungtabelle" for the Langium-binding (or both in core)? for improved performance (?)
        // alternativ discriminator rule: unknown => string; AstNode => node.$type; Vorsicht mit Sub-Typen (Vollständigkeit+Updates, no abstract types)!
        // später realisieren

        // explicit validations for typing issues, realized with Typir (which replaced corresponding functions in the OxValidator!)
        // TODO selector API + gleiche Diskussion für Inference Rules
        this.typir.validation.collector.addValidationRules(
            (node: unknown, typir: TypirServices) => {
                if (isIfStatement(node) || isWhileStatement(node) || isForStatement(node)) {
                    return typir.validation.constraints.ensureNodeIsAssignable(node.condition, typeBool,
                        () => <ValidationMessageDetails>{ message: "Conditions need to be evaluated to 'boolean'.", domainProperty: 'condition' });
                }
                if (isVariableDeclaration(node)) {
                    return [
                        ...typir.validation.constraints.ensureNodeHasNotType(node, typeVoid,
                            () => <ValidationMessageDetails>{ message: "Variables can't be declared with the type 'void'.", domainProperty: 'type' }),
                        ...typir.validation.constraints.ensureNodeIsAssignable(node.value, node,
                            (actual, expected) => <ValidationMessageDetails>{ message: `The initialization expression '${node.value?.$cstNode?.text}' of type '${actual.name}' is not assignable to the variable '${node.name}' with type '${expected.name}'.`, domainProperty: 'value' })
                    ];
                }
                if (isAssignmentStatement(node) && node.varRef.ref) {
                    return typir.validation.constraints.ensureNodeIsAssignable(node.value, node.varRef.ref,
                        (actual, expected) => <ValidationMessageDetails>{
                            message: `The expression '${node.value.$cstNode?.text}' of type '${actual.name}' is not assignable to the variable '${node.varRef.ref!.name}' with type '${expected.name}'.`,
                            domainProperty: 'value',
                        });
                }
                if (isReturnStatement(node)) {
                    const functionDeclaration = AstUtils.getContainerOfType(node, isFunctionDeclaration);
                    if (functionDeclaration && functionDeclaration.returnType.primitive !== 'void' && node.value) {
                        // the return value must fit to the return type of the function
                        return typir.validation.constraints.ensureNodeIsAssignable(node.value, functionDeclaration.returnType,
                            () => <ValidationMessageDetails>{ message: `The expression '${node.value!.$cstNode?.text}' is not usable as return value for the function '${functionDeclaration.name}'.`, domainProperty: 'value' });
                    }
                }
                return [];
            }
        );
    }

    override addedDomainElement(domainElement: AstNode): void {
        super.addedDomainElement(domainElement);
        // define function types
        // they have to be updated after each change of the Langium document, since they are derived from the user-defined FunctionDeclarations!
        if (isFunctionDeclaration(domainElement)) {
            const functionName = domainElement.name;
            // define function type
            this.functionKind.createFunctionType({
                functionName,
                // note that the following two lines internally use type inference here in order to map language types to Typir types
                outputParameter: { name: FUNCTION_MISSING_NAME, type: domainElement.returnType },
                inputParameters: domainElement.parameters.map(p => (<ParameterDetails>{ name: p.name, type: p.type })),
                // inference rule for function declaration:
                inferenceRuleForDeclaration: (domainElement: unknown) => domainElement === domainElement, // only the current function declaration matches!
                /** inference rule for funtion calls:
                 * - inferring of overloaded functions works only, if the actual arguments have the expected types!
                 * - (inferring calls to non-overloaded functions works independently from the types of the given parameters)
                 * - additionally, validations for the assigned values to the expected parameter( type)s are derived */
                inferenceRuleForCalls: {
                    filter: isMemberCall,
                    matching: (domainElement: MemberCall) => isFunctionDeclaration(domainElement.element.ref) && domainElement.element.ref.name === functionName,
                    inputArguments: (domainElement: MemberCall) => domainElement.arguments
                    // TODO does OX support overloaded function declarations? add a scope provider for that ...
                }
            });
        }
    }

    // TODO handle remove/delete/invalid case!
}


export function createOxTypirModule(): Module<TypirServices, PartialTypirServices> {
    return {
        // for OX, no specific configurations are required
        typeCreator: (services) => new OxTypeCreator(services),
    };
}
