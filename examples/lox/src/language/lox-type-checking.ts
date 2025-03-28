/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
******************************************************************************/

import { AstNode, AstUtils, LangiumSharedCoreServices, Module, assertUnreachable } from 'langium';
import { CreateFieldDetails, CreateMethodDetails, CreateParameterDetails, FunctionType, InferOperatorWithMultipleOperands, InferOperatorWithSingleOperand, InferenceRuleNotApplicable, NO_PARAMETER_NAME, TypeInitializer, TypirServices, ValidationProblemAcceptor } from 'typir';
import { AbstractLangiumTypeCreator, LangiumLanguageService, LangiumServicesForTypirBinding, PartialTypirLangiumServices } from 'typir-langium';
import { BinaryExpression, BooleanLiteral, Class, ForStatement, FunctionDeclaration, IfStatement, LoxAstType, MemberCall, MethodMember, NilLiteral, NumberLiteral, PrintStatement, ReturnStatement, StringLiteral, TypeReference, UnaryExpression, VariableDeclaration, WhileStatement, isClass, isFieldMember, isFunctionDeclaration, isMethodMember, isParameter, isVariableDeclaration, reflection } from './generated/ast.js';

/* eslint-disable @typescript-eslint/no-unused-vars */
export class LoxTypeCreator extends AbstractLangiumTypeCreator {
    protected readonly typir: LangiumServicesForTypirBinding;

    constructor(typirServices: LangiumServicesForTypirBinding, langiumServices: LangiumSharedCoreServices) {
        super(typirServices, langiumServices);
        this.typir = typirServices;
    }

    onInitialize(): void {
        // primitive types
        // typeBool, typeNumber and typeVoid are specific types for OX, ...
        const typeBool = this.typir.factory.Primitives.create({ primitiveName: 'boolean' })
            .inferenceRule({ languageKey: BooleanLiteral }) // this is the more performant notation compared to ...
            // .inferenceRule({ filter: isBooleanLiteral }) // ... this alternative solution, but they provide the same functionality
            .inferenceRule({ languageKey: TypeReference, matching: (node: TypeReference) => node.primitive === 'boolean' }) // this is the more performant notation compared to ...
            // .inferenceRule({ filter: isTypeReference, matching: node => node.primitive === 'boolean' }) // ... this "easier" notation, but they provide the same functionality
            .finish();
        // ... but their primitive kind is provided/preset by Typir
        const typeNumber = this.typir.factory.Primitives.create({ primitiveName: 'number' })
            .inferenceRule({ languageKey: NumberLiteral })
            .inferenceRule({ languageKey: TypeReference, matching: (node: TypeReference) => node.primitive === 'number' })
            .finish();
        const typeString = this.typir.factory.Primitives.create({ primitiveName: 'string' })
            .inferenceRule({ languageKey: StringLiteral })
            .inferenceRule({ languageKey: TypeReference, matching: (node: TypeReference) => node.primitive === 'string' })
            .finish();
        const typeVoid = this.typir.factory.Primitives.create({ primitiveName: 'void' })
            .inferenceRule({ languageKey: TypeReference, matching: (node: TypeReference) => node.primitive === 'void' })
            .inferenceRule({ languageKey: PrintStatement })
            .inferenceRule({ languageKey: ReturnStatement, matching: (node: ReturnStatement) => node.value === undefined })
            .finish();
        const typeNil = this.typir.factory.Primitives.create({ primitiveName: 'nil' })
            .inferenceRule({ languageKey: NilLiteral })
            .finish(); // 'nil' is only assignable to variables with a class as type in the LOX implementation here
        const typeAny = this.typir.factory.Top.create({}).finish();

        // extract inference rules, which is possible here thanks to the unified structure of the Langium grammar (but this is not possible in general!)
        const binaryInferenceRule: InferOperatorWithMultipleOperands<AstNode, BinaryExpression> = {
            languageKey: BinaryExpression,
            matching: (node: BinaryExpression, name: string) => node.operator === name,
            operands: (node: BinaryExpression, _name: string) => [node.left, node.right],
            validateArgumentsOfCalls: true,
        };
        const unaryInferenceRule: InferOperatorWithSingleOperand<AstNode, UnaryExpression> = {
            languageKey: UnaryExpression,
            matching: (node: UnaryExpression, name: string) => node.operator === name,
            operand: (node: UnaryExpression, _name: string) => node.value,
            validateArgumentsOfCalls: true,
        };

        // binary operators: numbers => number
        for (const operator of ['-', '*', '/']) {
            this.typir.factory.Operators.createBinary({ name: operator, signature: { left: typeNumber, right: typeNumber, return: typeNumber }}).inferenceRule(binaryInferenceRule).finish();
        }
        this.typir.factory.Operators.createBinary({ name: '+', signatures: [
            { left: typeNumber, right: typeNumber, return: typeNumber },
            { left: typeString, right: typeString, return: typeString },
            { left: typeNumber, right: typeString, return: typeString },
            { left: typeString, right: typeNumber, return: typeString },
        ]}).inferenceRule(binaryInferenceRule).finish();

        // binary operators: numbers => boolean
        for (const operator of ['<', '<=', '>', '>=']) {
            this.typir.factory.Operators.createBinary({ name: operator, signature: { left: typeNumber, right: typeNumber, return: typeBool }}).inferenceRule(binaryInferenceRule).finish();
        }

        // binary operators: booleans => boolean
        for (const operator of ['and', 'or']) {
            this.typir.factory.Operators.createBinary({ name: operator, signature: { left: typeBool, right: typeBool, return: typeBool }}).inferenceRule(binaryInferenceRule).finish();
        }

        // ==, != for all data types (the warning for different types is realized below)
        for (const operator of ['==', '!=']) {
            this.typir.factory.Operators.createBinary({ name: operator, signature: { left: typeAny, right: typeAny, return: typeBool }})
                .inferenceRule({
                    ...binaryInferenceRule,
                    // show a warning to the user, if something like "3 == false" is compared, since different types already indicate, that the IF condition will be evaluated to false
                    validation: (node, _operatorName, _operatorType, accept, typir) => typir.validation.Constraints.ensureNodeIsEquals(node.left, node.right, accept, (actual, expected) => ({
                        message: `This comparison will always return '${node.operator === '==' ? 'false' : 'true'}' as '${node.left.$cstNode?.text}' and '${node.right.$cstNode?.text}' have the different types '${actual.name}' and '${expected.name}'.`,
                        languageNode: node, // inside the BinaryExpression ...
                        languageProperty: 'operator', // ... mark the '==' or '!=' token, i.e. the 'operator' property
                        severity: 'warning',
                        // (The use of "node.right" and "node.left" without casting is possible, since the type checks of the given properties for the actual inference rule are reused for the validation.)
                    }))
                })
                .finish();
        }
        // = for SuperType = SubType (Note that this implementation of LOX realized assignments as operators!)
        this.typir.factory.Operators.createBinary({ name: '=', signature: { left: typeAny, right: typeAny, return: typeAny }})
            .inferenceRule({
                ...binaryInferenceRule,
                // this validation will be checked for each call of this operator!
                validation: (node, _opName, _opType, accept, typir) => typir.validation.Constraints.ensureNodeIsAssignable(node.right, node.left, accept, (actual, expected) => ({
                    message: `The expression '${node.right.$cstNode?.text}' of type '${actual.name}' is not assignable to '${node.left.$cstNode?.text}' with type '${expected.name}'`,
                    languageProperty: 'value' }))})
            .finish();

        // unary operators
        this.typir.factory.Operators.createUnary({ name: '!', signature: { operand: typeBool, return: typeBool }}).inferenceRule(unaryInferenceRule).finish();
        this.typir.factory.Operators.createUnary({ name: '-', signature: { operand: typeNumber, return: typeNumber }}).inferenceRule(unaryInferenceRule).finish();

        // additional inference rules for ...
        this.typir.Inference.addInferenceRulesForAstNodes<LoxAstType>({
            // ... member calls
            MemberCall: (languageNode) => {
                const ref = languageNode.element?.ref;
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
            },
            // ... variable declarations
            VariableDeclaration: (languageNode) => {
                if (languageNode.type) {
                    return languageNode.type; // the user declared this variable with a type
                } else if (languageNode.value) {
                    return languageNode.value; // the user didn't declare a type for this variable => do type inference of the assigned value instead!
                } else {
                    return InferenceRuleNotApplicable; // this case is impossible, there is a validation in the Langium LOX validator for this case
                }
            },
            // ... parameters
            Parameter: (languageNode) => languageNode.type,
        });

        // some explicit validations for typing issues with Typir (replaces corresponding functions in the LoxValidator!)
        this.typir.validation.Collector.addValidationRulesForAstNodes<LoxAstType>({
            ForStatement: this.validateCondition,
            IfStatement: this.validateCondition,
            ReturnStatement: this.validateReturnStatement,
            VariableDeclaration: this.validateVariableDeclaration,
            WhileStatement: this.validateCondition,
        });

        // check for unique function declarations
        this.typir.factory.Functions.createUniqueFunctionValidation({ registration: { languageKey: FunctionDeclaration }});

        // check for unique class declarations
        const uniqueClassValidator = this.typir.factory.Classes.createUniqueClassValidation({ registration: 'MYSELF' });
        // check for unique method declarations
        this.typir.factory.Classes.createUniqueMethodValidation({
            isMethodDeclaration: (node) => isMethodMember(node), // MethodMembers could have other $containers?
            getClassOfMethod: (method, _type) => method.$container,
            uniqueClassValidator: uniqueClassValidator,
            registration: { languageKey: MethodMember },
        });
        this.typir.validation.Collector.addValidationRule(uniqueClassValidator, { languageKey: Class }); // TODO this order is important, solve it in a different way!
        // check for cycles in super-sub-type relationships
        this.typir.factory.Classes.createNoSuperClassCyclesValidation({ registration: { languageKey: Class } });
    }

    onNewAstNode(node: AstNode): void {
        // define types which are declared by the users of LOX => investigate the current AST

        // function types: they have to be updated after each change of the Langium document, since they are derived from FunctionDeclarations!
        if (isFunctionDeclaration(node)) {
            this.createFunctionDetails(node); // this logic is reused for methods of classes, since the LOX grammar defines them very similar
        }

        // TODO support lambda (type references)!

        // class types (nominal typing):
        if (isClass(node)) {
            const className = node.name;
            const classType = this.typir.factory.Classes
                .create({
                    className,
                    superClasses: node.superClass?.ref, // note that type inference is used here
                    fields: node.members
                        .filter(isFieldMember) // only Fields, no Methods
                        .map(f => <CreateFieldDetails<AstNode>>{
                            name: f.name,
                            type: f.type, // note that type inference is used here
                        }),
                    methods: node.members
                        .filter(isMethodMember) // only Methods, no Fields
                        .map(member => <CreateMethodDetails<AstNode>>{ type: this.createFunctionDetails(member) }), // same logic as for functions, since the LOX grammar defines them very similar
                    associatedLanguageNode: node, // this is used by the ScopeProvider to get the corresponding class declaration after inferring the (class) type of an expression
                })
                // inference rule for declaration
                .inferenceRuleForClassDeclaration({ languageKey: Class, matching: (languageNode: Class) => languageNode === node})
                // inference rule for constructor calls (i.e. class literals) conforming to the current class
                .inferenceRuleForClassLiterals({ // <InferClassLiteral<MemberCall>>
                    languageKey: MemberCall,
                    matching: (languageNode: MemberCall) => isClass(languageNode.element?.ref) && languageNode.element!.ref.name === className && languageNode.explicitOperationCall,
                    inputValuesForFields: (_languageNode: MemberCall) => new Map(), // values for fields don't matter for nominal typing
                })
                .inferenceRuleForClassLiterals({ // <InferClassLiteral<TypeReference>>
                    languageKey: TypeReference,
                    matching: (languageNode: TypeReference) => isClass(languageNode.reference?.ref) && languageNode.reference!.ref.name === className,
                    inputValuesForFields: (_languageNode: TypeReference) => new Map(), // values for fields don't matter for nominal typing
                })
                // inference rule for accessing fields
                .inferenceRuleForFieldAccess({
                    languageKey: MemberCall,
                    matching: (languageNode: MemberCall) => isFieldMember(languageNode.element?.ref) && languageNode.element!.ref.$container === node && !languageNode.explicitOperationCall,
                    field: (languageNode: MemberCall) => languageNode.element!.ref!.name,
                })
                .finish();

            // explicitly declare, that 'nil' can be assigned to any Class variable
            classType.addListener(type => {
                this.typir.Conversion.markAsConvertible(this.typir.factory.Primitives.get({ primitiveName: 'nil' })!, type, 'IMPLICIT_EXPLICIT');
            });
            // The following idea does not work, since variables in LOX have a concrete class type and not an "any class" type:
            // this.typir.conversion.markAsConvertible(typeNil, this.classKind.getOrCreateTopClassType({}), 'IMPLICIT_EXPLICIT');
        }
    }

    protected createFunctionDetails(node: FunctionDeclaration | MethodMember): TypeInitializer<FunctionType, AstNode> {
        const config = this.typir.factory.Functions
            .create({
                functionName: node.name,
                outputParameter: { name: NO_PARAMETER_NAME, type: node.returnType },
                inputParameters: node.parameters.map(p => (<CreateParameterDetails<AstNode>>{ name: p.name, type: p.type })),
                associatedLanguageNode: node,
            })
            // inference rule for function declaration:
            .inferenceRuleForDeclaration({
                languageKey: node.$type,
                matching: (languageNode: FunctionDeclaration | MethodMember) => languageNode === node, // only the current function/method declaration matches!
            });
        /** inference rule for funtion/method calls:
         * - inferring of overloaded functions works only, if the actual arguments have the expected types!
         * - (inferring calls to non-overloaded functions works independently from the types of the given parameters)
         * - additionally, validations for the assigned values to the expected parameter( type)s are derived */
        if (isFunctionDeclaration(node)) {
            config.inferenceRuleForCalls({
                languageKey: MemberCall,
                matching: (languageNode: MemberCall) => isFunctionDeclaration(languageNode.element?.ref)
                    && languageNode.explicitOperationCall && languageNode.element!.ref === node,
                inputArguments: (languageNode: MemberCall) => languageNode.arguments,
                validateArgumentsOfFunctionCalls: true,
            });
        } else if (isMethodMember(node)) {
            config.inferenceRuleForCalls({
                languageKey: MemberCall,
                matching: (languageNode: MemberCall) => isMethodMember(languageNode.element?.ref)
                    && languageNode.explicitOperationCall && languageNode.element!.ref === node,
                inputArguments: (languageNode: MemberCall) => languageNode.arguments,
                validateArgumentsOfFunctionCalls: true,
            });
        } else {
            assertUnreachable(node);
        }
        return config.finish();
    }


    // Extracting functions for each validation check might improve their readability

    protected validateReturnStatement(node: ReturnStatement, accept: ValidationProblemAcceptor<AstNode>, typir: TypirServices<AstNode>): void {
        const callableDeclaration: FunctionDeclaration | MethodMember | undefined = AstUtils.getContainerOfType(node, node => isFunctionDeclaration(node) || isMethodMember(node));
        if (callableDeclaration && callableDeclaration.returnType.primitive && callableDeclaration.returnType.primitive !== 'void' && node.value) {
            // the return value must fit to the return type of the function / method
            typir.validation.Constraints.ensureNodeIsAssignable(node.value, callableDeclaration.returnType, accept, (actual, expected) => ({
                message: `The expression '${node.value!.$cstNode?.text}' of type '${actual.name}' is not usable as return value for the function '${callableDeclaration.name}' with return type '${expected.name}'.`,
                languageProperty: 'value' }));
        }
    }

    protected validateVariableDeclaration(node: VariableDeclaration, accept: ValidationProblemAcceptor<AstNode>, typir: TypirServices<AstNode>): void {
        const typeVoid = typir.factory.Primitives.get({ primitiveName: 'void' })!;
        typir.validation.Constraints.ensureNodeHasNotType(node, typeVoid, accept,
            () => ({ message: "Variable can't be declared with a type 'void'.", languageProperty: 'type' }));
        typir.validation.Constraints.ensureNodeIsAssignable(node.value, node, accept, (actual, expected) => ({
            message: `The expression '${node.value?.$cstNode?.text}' of type '${actual.name}' is not assignable to '${node.name}' with type '${expected.name}'`,
            languageProperty: 'value' }));
    }

    protected validateCondition(node: IfStatement | WhileStatement | ForStatement, accept: ValidationProblemAcceptor<AstNode>, typir: TypirServices<AstNode>): void {
        const typeBool = typir.factory.Primitives.get({ primitiveName: 'boolean' })!;
        typir.validation.Constraints.ensureNodeIsAssignable(node.condition, typeBool, accept,
            () => ({ message: "Conditions need to be evaluated to 'boolean'.", languageProperty: 'condition' }));
    }

}

export function createLoxTypirModule(langiumServices: LangiumSharedCoreServices): Module<LangiumServicesForTypirBinding, PartialTypirLangiumServices> {
    return {
        // specific configurations for LOX
        TypeCreator: (typirServices) => new LoxTypeCreator(typirServices, langiumServices), // specify the type system for LOX
        Language: () => new LangiumLanguageService(reflection), // tell Typir-Langium something about the LOX implementation with Langium
    };
}
// TODO doch noch eine Utils-Function hierfür schreiben, damit die Angabe der Reflection "erzwungen" werden kann?
