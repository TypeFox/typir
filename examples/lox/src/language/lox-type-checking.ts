/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
******************************************************************************/

import { AstNode, AstUtils, LangiumSharedCoreServices, Module, assertUnreachable } from 'langium';
import { CreateFieldDetails, CreateFunctionTypeDetails, CreateParameterDetails, InferOperatorWithMultipleOperands, InferOperatorWithSingleOperand, InferenceRuleNotApplicable, NO_PARAMETER_NAME, TypirServices, UniqueClassValidation, UniqueFunctionValidation, UniqueMethodValidation, ValidationMessageDetails, createNoSuperClassCyclesValidation } from 'typir';
import { AbstractLangiumTypeCreator, LangiumServicesForTypirBinding, PartialTypirLangiumServices } from 'typir-langium';
import { BinaryExpression, FunctionDeclaration, MemberCall, MethodMember, TypeReference, UnaryExpression, isBinaryExpression, isBooleanLiteral, isClass, isFieldMember, isForStatement, isFunctionDeclaration, isIfStatement, isMemberCall, isMethodMember, isNilLiteral, isNumberLiteral, isParameter, isPrintStatement, isReturnStatement, isStringLiteral, isTypeReference, isUnaryExpression, isVariableDeclaration, isWhileStatement } from './generated/ast.js';

/* eslint-disable @typescript-eslint/no-unused-vars */
export class LoxTypeCreator extends AbstractLangiumTypeCreator {
    protected readonly typir: TypirServices;

    constructor(typirServices: TypirServices, langiumServices: LangiumSharedCoreServices) {
        super(typirServices, langiumServices);
        this.typir = typirServices;
    }

    onInitialize(): void {
        // primitive types
        // typeBool, typeNumber and typeVoid are specific types for OX, ...
        const typeBool = this.typir.factory.Primitives.create({ primitiveName: 'boolean',
            inferenceRules: [
                isBooleanLiteral,
                (node: unknown) => isTypeReference(node) && node.primitive === 'boolean'
            ]});
        // ... but their primitive kind is provided/preset by Typir
        const typeNumber = this.typir.factory.Primitives.create({ primitiveName: 'number',
            inferenceRules: [
                isNumberLiteral,
                (node: unknown) => isTypeReference(node) && node.primitive === 'number'
            ]});
        const typeString = this.typir.factory.Primitives.create({ primitiveName: 'string',
            inferenceRules: [
                isStringLiteral,
                (node: unknown) => isTypeReference(node) && node.primitive === 'string'
            ]});
        const typeVoid = this.typir.factory.Primitives.create({ primitiveName: 'void',
            inferenceRules: [
                (node: unknown) => isTypeReference(node) && node.primitive === 'void',
                isPrintStatement,
                (node: unknown) => isReturnStatement(node) && node.value === undefined
            ] });
        const typeNil = this.typir.factory.Primitives.create({ primitiveName: 'nil',
            inferenceRules: isNilLiteral }); // 'nil' is only assignable to variables with a class as type in the LOX implementation here
        const typeAny = this.typir.factory.Top.create({});

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

        // binary operators: numbers => number
        for (const operator of ['-', '*', '/']) {
            this.typir.factory.Operators.createBinary({ name: operator, signature: { left: typeNumber, right: typeNumber, return: typeNumber }, inferenceRule: binaryInferenceRule });
        }
        this.typir.factory.Operators.createBinary({ name: '+', signatures: [
            { left: typeNumber, right: typeNumber, return: typeNumber },
            { left: typeString, right: typeString, return: typeString },
            { left: typeNumber, right: typeString, return: typeString },
            { left: typeString, right: typeNumber, return: typeString },
        ], inferenceRule: binaryInferenceRule });

        // binary operators: numbers => boolean
        for (const operator of ['<', '<=', '>', '>=']) {
            this.typir.factory.Operators.createBinary({ name: operator, signature: { left: typeNumber, right: typeNumber, return: typeBool }, inferenceRule: binaryInferenceRule });
        }

        // binary operators: booleans => boolean
        for (const operator of ['and', 'or']) {
            this.typir.factory.Operators.createBinary({ name: operator, signature: { left: typeBool, right: typeBool, return: typeBool }, inferenceRule: binaryInferenceRule });
        }

        // ==, != for all data types (the warning for different types is realized below)
        for (const operator of ['==', '!=']) {
            this.typir.factory.Operators.createBinary({ name: operator, signature: { left: typeAny, right: typeAny, return: typeBool }, inferenceRule: binaryInferenceRule,
                // show a warning to the user, if something like "3 == false" is compared, since different types already indicate, that the IF condition will be evaluated to false
                validationRule: (node, _operatorName, _operatorType, typir) => typir.validation.Constraints.ensureNodeIsEquals(node.left, node.right, (actual, expected) => <ValidationMessageDetails>{
                    message: `This comparison will always return '${node.operator === '==' ? 'false' : 'true'}' as '${node.left.$cstNode?.text}' and '${node.right.$cstNode?.text}' have the different types '${actual.name}' and '${expected.name}'.`,
                    domainElement: node, // inside the BinaryExpression ...
                    domainProperty: 'operator', // ... mark the '==' or '!=' token, i.e. the 'operator' property
                    severity: 'warning' }),
                // (The use of "node.right" and "node.left" without casting is possible, since the type checks of the given 'inferenceRule' are reused for the 'validationRule'.
                //  This approach saves the duplication of checks for inference and validation, but makes the validation rules depending on the inference rule.)
            });
        }
        // = for SuperType = SubType (Note that this implementation of LOX realized assignments as operators!)
        this.typir.factory.Operators.createBinary({ name: '=', signature: { left: typeAny, right: typeAny, return: typeAny }, inferenceRule: binaryInferenceRule,
            // this validation will be checked for each call of this operator!
            validationRule: (node, _opName, _opType, typir) => typir.validation.Constraints.ensureNodeIsAssignable(node.right, node.left, (actual, expected) => <ValidationMessageDetails>{
                message: `The expression '${node.right.$cstNode?.text}' of type '${actual.name}' is not assignable to '${node.left.$cstNode?.text}' with type '${expected.name}'`,
                domainProperty: 'value' }),
        });

        // unary operators
        this.typir.factory.Operators.createUnary({ name: '!', signature: { operand: typeBool, return: typeBool }, inferenceRule: unaryInferenceRule });
        this.typir.factory.Operators.createUnary({ name: '-', signature: { operand: typeNumber, return: typeNumber }, inferenceRule: unaryInferenceRule });

        // additional inference rules for ...
        this.typir.Inference.addInferenceRule((domainElement: unknown) => {
            // ... member calls
            if (isMemberCall(domainElement)) {
                const ref = domainElement.element?.ref;
                if (isClass(ref)) {
                    return InferenceRuleNotApplicable; // not required anymore
                } else if (isFieldMember(ref)) {
                    return InferenceRuleNotApplicable; // inference rule is registered directly at the Fields
                } else if (isMethodMember(ref)) {
                    return InferenceRuleNotApplicable; // inference rule is registered directly at the method
                } else if (isVariableDeclaration(ref)) {
                    return ref; // use variables inside expressions: infer the Typir type from the variable, see the case below
                } else if (isParameter(ref)) {
                    return ref.type; // use parameters inside expressions
                } else if (isFunctionDeclaration(ref)) {
                    return InferenceRuleNotApplicable; // there is already an inference rule for function calls
                } else if (ref === undefined) {
                    return InferenceRuleNotApplicable; // unresolved cross-reference: syntactic issues must be fixed before type checking can be applied
                } else {
                    assertUnreachable(ref);
                }
            }
            // ... variable declarations
            if (isVariableDeclaration(domainElement)) {
                if (domainElement.type) {
                    return domainElement.type; // the user declared this variable with a type
                } else if (domainElement.value) {
                    return domainElement.value; // the user didn't declare a type for this variable => do type inference of the assigned value instead!
                } else {
                    return InferenceRuleNotApplicable; // this case is impossible, there is a validation in the Langium LOX validator for this case
                }
            }
            // ... parameters
            if (isParameter(domainElement)) {
                return domainElement.type;
            }
            return InferenceRuleNotApplicable;
        });

        // some explicit validations for typing issues with Typir (replaces corresponding functions in the OxValidator!)
        this.typir.validation.Collector.addValidationRule(
            (node: unknown, typir: TypirServices) => {
                if (isIfStatement(node) || isWhileStatement(node) || isForStatement(node)) {
                    return typir.validation.Constraints.ensureNodeIsAssignable(node.condition, typeBool,
                        () => <ValidationMessageDetails>{ message: "Conditions need to be evaluated to 'boolean'.", domainProperty: 'condition' });
                }
                if (isVariableDeclaration(node)) {
                    return [
                        ...typir.validation.Constraints.ensureNodeHasNotType(node, typeVoid,
                            () => <ValidationMessageDetails>{ message: "Variable can't be declared with a type 'void'.", domainProperty: 'type' }),
                        ...typir.validation.Constraints.ensureNodeIsAssignable(node.value, node, (actual, expected) => <ValidationMessageDetails>{
                            message: `The expression '${node.value?.$cstNode?.text}' of type '${actual.name}' is not assignable to '${node.name}' with type '${expected.name}'`,
                            domainProperty: 'value' }),
                    ];
                }
                if (isReturnStatement(node)) {
                    const callableDeclaration: FunctionDeclaration | MethodMember | undefined = AstUtils.getContainerOfType(node, node => isFunctionDeclaration(node) || isMethodMember(node));
                    if (callableDeclaration && callableDeclaration.returnType.primitive && callableDeclaration.returnType.primitive !== 'void' && node.value) {
                        // the return value must fit to the return type of the function / method
                        return typir.validation.Constraints.ensureNodeIsAssignable(node.value, callableDeclaration.returnType, (actual, expected) => <ValidationMessageDetails>{
                            message: `The expression '${node.value!.$cstNode?.text}' of type '${actual.name}' is not usable as return value for the function '${callableDeclaration.name}' with return type '${expected.name}'.`,
                            domainProperty: 'value' });
                    }
                }
                return [];
            }
        );

        // check for unique function declarations
        this.typir.validation.Collector.addValidationRuleWithBeforeAndAfter(new UniqueFunctionValidation(this.typir, isFunctionDeclaration));

        // check for unique class declarations
        const uniqueClassValidator = new UniqueClassValidation(this.typir, isClass);
        // check for unique method declarations
        this.typir.validation.Collector.addValidationRuleWithBeforeAndAfter(new UniqueMethodValidation(this.typir,
            (node) => isMethodMember(node), // MethodMembers could have other $containers?
            (method, _type) => method.$container,
            uniqueClassValidator,
        ));
        this.typir.validation.Collector.addValidationRuleWithBeforeAndAfter(uniqueClassValidator); // TODO this order is important, solve it in a different way!
        // check for cycles in super-sub-type relationships
        this.typir.validation.Collector.addValidationRule(createNoSuperClassCyclesValidation(isClass));
    }

    onNewAstNode(node: AstNode): void {
        // define types which are declared by the users of LOX => investigate the current AST

        // function types: they have to be updated after each change of the Langium document, since they are derived from FunctionDeclarations!
        if (isFunctionDeclaration(node)) {
            this.typir.factory.Functions.create(createFunctionDetails(node)); // this logic is reused for methods of classes, since the LOX grammar defines them very similar
        }

        // TODO support lambda (type references)!

        // class types (nominal typing):
        if (isClass(node)) {
            const className = node.name;
            const classType = this.typir.factory.Classes.create({
                className,
                superClasses: node.superClass?.ref, // note that type inference is used here
                fields: node.members
                    .filter(isFieldMember) // only Fields, no Methods
                    .map(f => <CreateFieldDetails>{
                        name: f.name,
                        type: f.type, // note that type inference is used here
                    }),
                methods: node.members
                    .filter(isMethodMember) // only Methods, no Fields
                    .map(member => createFunctionDetails(member)), // same logic as for functions, since the LOX grammar defines them very similar
                // inference rule for declaration
                inferenceRuleForDeclaration: (domainElement: unknown) => domainElement === node,
                // inference rule for constructor calls (i.e. class literals) conforming to the current class
                inferenceRuleForConstructor: { // <InferClassLiteral<MemberCall>>
                    filter: isMemberCall,
                    matching: (domainElement: MemberCall) => isClass(domainElement.element?.ref) && domainElement.element!.ref.name === className && domainElement.explicitOperationCall,
                    inputValuesForFields: (_domainElement: MemberCall) => new Map(), // values for fields don't matter for nominal typing
                },
                inferenceRuleForReference: { // <InferClassLiteral<TypeReference>>
                    filter: isTypeReference,
                    matching: (domainElement: TypeReference) => isClass(domainElement.reference?.ref) && domainElement.reference!.ref.name === className,
                    inputValuesForFields: (_domainElement: TypeReference) => new Map(), // values for fields don't matter for nominal typing
                },
                // inference rule for accessing fields
                inferenceRuleForFieldAccess: (domainElement: unknown) => isMemberCall(domainElement) && isFieldMember(domainElement.element?.ref) && domainElement.element!.ref.$container === node && !domainElement.explicitOperationCall
                    ? domainElement.element!.ref.name : InferenceRuleNotApplicable,
                associatedDomainElement: node,
            });

            // explicitly declare, that 'nil' can be assigned to any Class variable
            classType.addListener(type => {
                this.typir.Conversion.markAsConvertible(this.typir.factory.Primitives.get({ primitiveName: 'nil' })!, type, 'IMPLICIT_EXPLICIT');
            });
            // The following idea does not work, since variables in LOX have a concrete class type and not an "any class" type:
            // this.typir.conversion.markAsConvertible(typeNil, this.classKind.getOrCreateTopClassType({}), 'IMPLICIT_EXPLICIT');
        }
    }
}

function createFunctionDetails(node: FunctionDeclaration | MethodMember): CreateFunctionTypeDetails<MemberCall> {
    const callableName = node.name;
    return {
        functionName: callableName,
        outputParameter: { name: NO_PARAMETER_NAME, type: node.returnType },
        inputParameters: node.parameters.map(p => (<CreateParameterDetails>{ name: p.name, type: p.type })),
        // inference rule for function declaration:
        inferenceRuleForDeclaration: (domainElement: unknown) => domainElement === node, // only the current function/method declaration matches!
        /** inference rule for funtion/method calls:
         * - inferring of overloaded functions works only, if the actual arguments have the expected types!
         * - (inferring calls to non-overloaded functions works independently from the types of the given parameters)
         * - additionally, validations for the assigned values to the expected parameter( type)s are derived */
        inferenceRuleForCalls: {
            filter: isMemberCall,
            matching: (domainElement: MemberCall) => (isFunctionDeclaration(domainElement.element?.ref) || isMethodMember(domainElement.element?.ref))
                && domainElement.explicitOperationCall && domainElement.element!.ref.name === callableName,
            inputArguments: (domainElement: MemberCall) => domainElement.arguments
        },
        associatedDomainElement: node,
    };
}

export function createLoxTypirModule(langiumServices: LangiumSharedCoreServices): Module<LangiumServicesForTypirBinding, PartialTypirLangiumServices> {
    return {
        // specific configurations for LOX
        TypeCreator: (typirServices) => new LoxTypeCreator(typirServices, langiumServices),
    };
}
