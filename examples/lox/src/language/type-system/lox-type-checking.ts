/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
******************************************************************************/

import { AstNode, AstUtils, Module, assertUnreachable } from 'langium';
import { LangiumSharedServices } from 'langium/lsp';
import { ClassKind, CreateFieldDetails, CreateFunctionTypeDetails, CreateParameterDetails, FunctionKind, InferOperatorWithMultipleOperands, InferOperatorWithSingleOperand, InferenceRuleNotApplicable, NO_PARAMETER_NAME, OperatorManager, PrimitiveKind, TopKind, TypirServices, UniqueClassValidation, UniqueFunctionValidation, UniqueMethodValidation, createNoSuperClassCyclesValidation } from 'typir';
import { AbstractLangiumTypeCreator, LangiumServicesForTypirBinding, PartialTypirLangiumServices } from 'typir-langium';
import { ValidationMessageDetails } from '../../../../../packages/typir/lib/features/validation.js';
import { BinaryExpression, FunctionDeclaration, MemberCall, MethodMember, TypeReference, UnaryExpression, isBinaryExpression, isBooleanLiteral, isClass, isClassMember, isFieldMember, isForStatement, isFunctionDeclaration, isIfStatement, isMemberCall, isMethodMember, isNilLiteral, isNumberLiteral, isParameter, isPrintStatement, isReturnStatement, isStringLiteral, isTypeReference, isUnaryExpression, isVariableDeclaration, isWhileStatement } from '../generated/ast.js';

/* eslint-disable @typescript-eslint/no-unused-vars */
export class LoxTypeCreator extends AbstractLangiumTypeCreator {
    protected readonly typir: TypirServices;
    protected readonly primitiveKind: PrimitiveKind;
    protected readonly functionKind: FunctionKind;
    protected readonly classKind: ClassKind;
    protected readonly anyKind: TopKind;
    protected readonly operators: OperatorManager;

    constructor(typirServices: TypirServices, langiumServices: LangiumSharedServices) {
        super(typirServices, langiumServices);
        this.typir = typirServices;

        this.primitiveKind = new PrimitiveKind(this.typir);
        this.functionKind = new FunctionKind(this.typir);
        this.classKind = new ClassKind(this.typir, {
            typing: 'Nominal',
        });
        this.anyKind = new TopKind(this.typir);
        this.operators = this.typir.operators;
    }

    onInitialize(): void {
        // primitive types
        // typeBool, typeNumber and typeVoid are specific types for OX, ...
        const typeBool = this.primitiveKind.createPrimitiveType({ primitiveName: 'boolean',
            inferenceRules: [
                isBooleanLiteral,
                (node: unknown) => isTypeReference(node) && node.primitive === 'boolean'
            ]});
        // ... but their primitive kind is provided/preset by Typir
        const typeNumber = this.primitiveKind.createPrimitiveType({ primitiveName: 'number',
            inferenceRules: [
                isNumberLiteral,
                (node: unknown) => isTypeReference(node) && node.primitive === 'number'
            ]});
        const typeString = this.primitiveKind.createPrimitiveType({ primitiveName: 'string',
            inferenceRules: [
                isStringLiteral,
                (node: unknown) => isTypeReference(node) && node.primitive === 'string'
            ]});
        const typeVoid = this.primitiveKind.createPrimitiveType({ primitiveName: 'void',
            inferenceRules: [
                (node: unknown) => isTypeReference(node) && node.primitive === 'void',
                isPrintStatement,
                (node: unknown) => isReturnStatement(node) && node.value === undefined
            ] });
        const typeNil = this.primitiveKind.createPrimitiveType({ primitiveName: 'nil',
            inferenceRules: isNilLiteral }); // From "Crafting Interpreters" no value, like null in other languages. Uninitialised variables default to nil. When the execution reaches the end of the block of a function body without hitting a return, nil is implicitly returned.
        const typeAny = this.anyKind.createTopType({});

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
            this.operators.createBinaryOperator({ name: operator, signature: { left: typeNumber, right: typeNumber, return: typeNumber }, inferenceRule: binaryInferenceRule });
        }
        this.operators.createBinaryOperator({ name: '+', signature: [
            { left: typeNumber, right: typeNumber, return: typeNumber },
            { left: typeString, right: typeString, return: typeString },
            { left: typeNumber, right: typeString, return: typeString },
            { left: typeString, right: typeNumber, return: typeString },
        ], inferenceRule: binaryInferenceRule });

        // binary operators: numbers => boolean
        for (const operator of ['<', '<=', '>', '>=']) {
            this.operators.createBinaryOperator({ name: operator, signature: { left: typeNumber, right: typeNumber, return: typeBool }, inferenceRule: binaryInferenceRule });
        }

        // binary operators: booleans => boolean
        for (const operator of ['and', 'or']) {
            this.operators.createBinaryOperator({ name: operator, signature: { left: typeBool, right: typeBool, return: typeBool }, inferenceRule: binaryInferenceRule });
        }

        // ==, != for all data types (the warning for different types is realized below)
        for (const operator of ['==', '!=']) {
            this.operators.createBinaryOperator({ name: operator, signature: { left: typeAny, right: typeAny, return: typeBool }, inferenceRule: binaryInferenceRule });
        }
        // = for SuperType = SubType (TODO integrate the validation here? should be replaced!)
        this.operators.createBinaryOperator({ name: '=', signature: { left: typeAny, right: typeAny, return: typeAny }, inferenceRule: binaryInferenceRule });

        // unary operators
        this.operators.createUnaryOperator({ name: '!', signature: { operand: typeBool, return: typeBool }, inferenceRule: unaryInferenceRule });
        this.operators.createUnaryOperator({ name: '-', signature: { operand: typeNumber, return: typeNumber }, inferenceRule: unaryInferenceRule });

        // additional inference rules for ...
        this.typir.inference.addInferenceRule((domainElement: unknown) => {
            // ... member calls
            if (isMemberCall(domainElement)) {
                const ref = domainElement.element?.ref;
                if (isClass(ref)) {
                    return InferenceRuleNotApplicable; // not required anymore
                } else if (isClassMember(ref)) {
                    return InferenceRuleNotApplicable; // TODO
                } else if (isMethodMember(ref)) {
                    return InferenceRuleNotApplicable; // TODO
                } else if (isVariableDeclaration(ref)) {
                    // use variables inside expressions!
                    return ref; // infer the Typir type from the variable, see the case below
                } else if (isParameter(ref)) {
                    // use parameters inside expressions
                    return ref.type;
                } else if (isFunctionDeclaration(ref)) {
                    // there is already an inference rule for function calls
                    return InferenceRuleNotApplicable;
                } else if (ref === undefined) {
                    return InferenceRuleNotApplicable;
                } else {
                    assertUnreachable(ref);
                }
            }
            // ... variable declarations
            if (isVariableDeclaration(domainElement)) {
                if (domainElement.type) {
                    // the user declared this variable with a type
                    return domainElement.type;
                } else if (domainElement.value) {
                    // the didn't declared a type for this variable => do type inference of the assigned value instead!
                    return domainElement.value;
                } else {
                    return InferenceRuleNotApplicable; // this case is impossible, there is a validation in the Langium LOX validator for this case
                }
            }
            return InferenceRuleNotApplicable;
        });

        // some explicit validations for typing issues with Typir (replaces corresponding functions in the OxValidator!)
        this.typir.validation.collector.addValidationRule(
            (node: unknown, typir: TypirServices) => {
                if (isIfStatement(node) || isWhileStatement(node) || isForStatement(node)) {
                    return typir.validation.constraints.ensureNodeIsAssignable(node.condition, typeBool,
                        () => <ValidationMessageDetails>{ message: "Conditions need to be evaluated to 'boolean'.", domainProperty: 'condition' });
                }
                if (isVariableDeclaration(node)) {
                    return [
                        ...typir.validation.constraints.ensureNodeHasNotType(node, typeVoid,
                            () => <ValidationMessageDetails>{ message: "Variable can't be declared with a type 'void'.", domainProperty: 'type' }),
                        ...typir.validation.constraints.ensureNodeIsAssignable(node.value, node, (actual, expected) => <ValidationMessageDetails>{
                            message: `The expression '${node.value?.$cstNode?.text}' of type '${actual.name}' is not assignable to '${node.name}' with type '${expected.name}'`,
                            domainProperty: 'value' }),
                    ];
                }
                if (isBinaryExpression(node) && node.operator === '=') {
                    return typir.validation.constraints.ensureNodeIsAssignable(node.right, node.left, (actual, expected) => <ValidationMessageDetails>{
                        message: `The expression '${node.right.$cstNode?.text}' of type '${actual.name}' is not assignable to '${node.left.$cstNode?.text}' with type '${expected.name}'`,
                        domainProperty: 'value' });
                }
                if (isBinaryExpression(node) && (node.operator === '==' || node.operator === '!=')) {
                    return typir.validation.constraints.ensureNodeIsEquals(node.left, node.right, (actual, expected) => <ValidationMessageDetails>{
                        message: `This comparison will always return '${node.operator === '==' ? 'false' : 'true'}' as '${node.left.$cstNode?.text}' and '${node.right.$cstNode?.text}' have the different types '${actual.name}' and '${expected.name}'.`,
                        domainElement: node, // mark the 'operator' property! (note that "node.right" and "node.left" are the input for Typir)
                        domainProperty: 'operator',
                        severity: 'warning' });
                }
                if (isReturnStatement(node)) {
                    const callableDeclaration: FunctionDeclaration | MethodMember | undefined = AstUtils.getContainerOfType(node, node => isFunctionDeclaration(node) || isMethodMember(node));
                    if (callableDeclaration && callableDeclaration.returnType.primitive && callableDeclaration.returnType.primitive !== 'void' && node.value) {
                        // the return value must fit to the return type of the function / method
                        return typir.validation.constraints.ensureNodeIsAssignable(node.value, callableDeclaration.returnType, (actual, expected) => <ValidationMessageDetails>{
                            message: `The expression '${node.value!.$cstNode?.text}' of type '${actual.name}' is not usable as return value for the function '${callableDeclaration.name}' with return type '${expected.name}'.`,
                            domainProperty: 'value' });
                    }
                }
                return [];
            }
        );

        // check for unique function declarations
        this.typir.validation.collector.addValidationRuleWithBeforeAndAfter(new UniqueFunctionValidation(this.typir, isFunctionDeclaration));

        // check for unique class declarations
        this.typir.validation.collector.addValidationRuleWithBeforeAndAfter(new UniqueClassValidation(this.typir, isClass));
        // check for unique method declarations
        this.typir.validation.collector.addValidationRuleWithBeforeAndAfter(new UniqueMethodValidation(this.typir,
            (node) => isMethodMember(node), // MethodMembers could have other $containers?
            (method, _type) => method.$container));
        // check for cycles in super-sub-type relationships
        this.typir.validation.collector.addValidationRule(createNoSuperClassCyclesValidation(isClass));
    }

    onNewAstNode(node: AstNode): void {
        // define types which are declared by the users of LOX => investigate the current AST

        // function types: they have to be updated after each change of the Langium document, since they are derived from FunctionDeclarations!
        if (isFunctionDeclaration(node)) {
            this.functionKind.createFunctionType(createFunctionDetails(node)); // this logic is reused for methods of classes, since the LOX grammar defines them very similar
        }

        // TODO support lambda (type references)!

        // class types (nominal typing):
        if (isClass(node)) {
            const className = node.name;
            const classType = this.classKind.createClassType({
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
                // inference ruleS(?) for objects/class literals conforming to the current class
                inferenceRuleForLiteral: { // <InferClassLiteral<MemberCall>>
                    filter: isMemberCall,
                    matching: (domainElement: MemberCall) => isClass(domainElement.element?.ref) && domainElement.element!.ref.name === className,
                    inputValuesForFields: (_domainElement: MemberCall) => new Map(), // values for fields don't matter for nominal typing
                },
                inferenceRuleForReference: { // <InferClassLiteral<TypeReference>>
                    filter: isTypeReference,
                    matching: (domainElement: TypeReference) => isClass(domainElement.reference?.ref) && domainElement.reference!.ref.name === className,
                    inputValuesForFields: (_domainElement: TypeReference) => new Map(), // values for fields don't matter for nominal typing
                },
                // inference rule for accessing fields
                inferenceRuleForFieldAccess: (domainElement: unknown) => isMemberCall(domainElement) && isFieldMember(domainElement.element?.ref) && domainElement.element!.ref.$container === node
                    ? domainElement.element!.ref.name : InferenceRuleNotApplicable,
            });

            // TODO conversion 'nil' to classes ('TopClass')!
            // any class !== all classes; here we want to say, that 'nil' is assignable to each concrete Class type!
            // this.typir.conversion.markAsConvertible(typeNil, this.classKind.getOrCreateTopClassType({}), 'IMPLICIT_EXPLICIT');
            classType.addListener(type => {
                this.typir.conversion.markAsConvertible(this.primitiveKind.getPrimitiveType({ primitiveName: 'nil' })!, type, 'IMPLICIT_EXPLICIT');
            });
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
                && domainElement.element!.ref.name === callableName,
            inputArguments: (domainElement: MemberCall) => domainElement.arguments
        },
    };
}

export function createLoxTypirModule(langiumServices: LangiumSharedServices): Module<LangiumServicesForTypirBinding, PartialTypirLangiumServices> {
    return {
        // specific configurations for LOX
        TypeCreator: (typirServices) => new LoxTypeCreator(typirServices, langiumServices),
    };
}
