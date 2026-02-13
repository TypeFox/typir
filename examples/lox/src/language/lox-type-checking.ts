/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
******************************************************************************/

import { AstNode, AstUtils, assertUnreachable, diagnosticData } from 'langium';
import { CreateFieldDetails, CreateMethodDetails, CreateParameterDetails, FunctionType, InferOperatorWithMultipleOperands, InferOperatorWithSingleOperand, InferenceRuleNotApplicable, NO_PARAMETER_NAME, TypeInitializer, TypirServices, ValidationProblemAcceptor } from 'typir';
import { LangiumTypeSystemDefinition, TypirLangiumServices, TypirLangiumSpecifics } from 'typir-langium';
import { BinaryExpression, BooleanLiteral, Class, ForStatement, FunctionDeclaration, IfStatement, LoxAstType, MemberCall, MethodMember, NilLiteral, NumberLiteral, PrintStatement, ReturnStatement, StringLiteral, TypeReference, UnaryExpression, VariableDeclaration, WhileStatement, isClass, isFieldMember, isFunctionDeclaration, isMethodMember, isParameter, isVariableDeclaration } from './generated/ast.js';

/* eslint-disable @typescript-eslint/no-unused-vars */

export interface LoxSpecifics extends TypirLangiumSpecifics { // concretize some LOX-specifics here
    LanguageKeys: LoxAstType; // all AST types from the generated `ast.ts`
}
// interface extensions is used to concretize the `LanguageKeys`, since type intersection would merge `LangiumAstTypes` and `LoxAstType` (https://www.typescriptlang.org/docs/handbook/2/objects.html#interface-extension-vs-intersection)

export class LoxTypeSystem implements LangiumTypeSystemDefinition<LoxSpecifics> {

    onInitialize(typir: TypirLangiumServices<LoxSpecifics>): void {
        // primitive types
        // typeBool, typeNumber and typeVoid are specific types for OX, ...
        const typeBool = typir.factory.Primitives.create({ primitiveName: 'boolean' })
            .inferenceRule({ languageKey: BooleanLiteral.$type }) // this is the more performant notation compared to ...
            // .inferenceRule({ filter: isBooleanLiteral }) // ... this alternative solution, but they provide the same functionality
            .inferenceRule({ languageKey: TypeReference.$type, matching: node => node.primitive === 'boolean' }) // this is the more performant notation compared to ...
            // .inferenceRule({ filter: isTypeReference, matching: node => node.primitive === 'boolean' }) // ... this "easier" notation, but they provide the same functionality
            .finish();
        // ... but their primitive kind is provided/preset by Typir
        const typeNumber = typir.factory.Primitives.create({ primitiveName: 'number' })
            .inferenceRule({ languageKey: NumberLiteral.$type })
            .inferenceRule({ languageKey: TypeReference.$type, matching: node => node.primitive === 'number' })
            .finish();
        const typeString = typir.factory.Primitives.create({ primitiveName: 'string' })
            .inferenceRule({ languageKey: StringLiteral.$type })
            .inferenceRule({ languageKey: TypeReference.$type, matching: node => node.primitive === 'string' })
            .finish();
        const typeVoid = typir.factory.Primitives.create({ primitiveName: 'void' })
            .inferenceRule({ languageKey: TypeReference.$type, matching: node => node.primitive === 'void' })
            .inferenceRule({ languageKey: PrintStatement.$type })
            .inferenceRule({ languageKey: ReturnStatement.$type, matching: node => node.value === undefined })
            .finish();
        const typeNil = typir.factory.Primitives.create({ primitiveName: 'nil' })
            .inferenceRule({ languageKey: NilLiteral.$type })
            .finish(); // 'nil' is only assignable to variables with a class as type in the LOX implementation here
        const typeAny = typir.factory.Top.create({}).finish();

        // extract inference rules, which is possible here thanks to the unified structure of the Langium grammar (but this is not possible in general!)
        const binaryInferenceRule: InferOperatorWithMultipleOperands<LoxSpecifics, BinaryExpression> = {
            languageKey: BinaryExpression.$type,
            matching: (node, name) => node.operator === name,
            operands: (node, _name) => [node.left, node.right],
            validateArgumentsOfCalls: true,
        };
        const unaryInferenceRule: InferOperatorWithSingleOperand<LoxSpecifics, UnaryExpression> = {
            languageKey: UnaryExpression.$type,
            matching: (node, name) => node.operator === name,
            operand: (node, _name) => node.value,
            validateArgumentsOfCalls: true,
        };

        // binary operators: numbers => number
        for (const operator of ['-', '*', '/']) {
            typir.factory.Operators.createBinary({ name: operator, signature: { left: typeNumber, right: typeNumber, return: typeNumber }}).inferenceRule(binaryInferenceRule).finish();
        }
        typir.factory.Operators.createBinary({ name: '+', signatures: [
            { left: typeNumber, right: typeNumber, return: typeNumber },
            { left: typeString, right: typeString, return: typeString },
            { left: typeNumber, right: typeString, return: typeString },
            { left: typeString, right: typeNumber, return: typeString },
        ]}).inferenceRule(binaryInferenceRule).finish();

        // binary operators: numbers => boolean
        for (const operator of ['<', '<=', '>', '>=']) {
            typir.factory.Operators.createBinary({ name: operator, signature: { left: typeNumber, right: typeNumber, return: typeBool }}).inferenceRule(binaryInferenceRule).finish();
        }

        // binary operators: booleans => boolean
        for (const operator of ['and', 'or']) {
            typir.factory.Operators.createBinary({ name: operator, signature: { left: typeBool, right: typeBool, return: typeBool }}).inferenceRule(binaryInferenceRule).finish();
        }

        // ==, != for all data types (the warning for different types is realized below)
        for (const operator of ['==', '!=']) {
            typir.factory.Operators.createBinary({ name: operator, signature: { left: typeAny, right: typeAny, return: typeBool }})
                .inferenceRule({
                    ...binaryInferenceRule,
                    // show a warning to the user, if something like "3 == false" is compared, since different types already indicate, that the IF condition will be evaluated to false
                    validation: (node, _operatorName, _operatorType, accept, typir) => typir.validation.Constraints.ensureNodeIsEquals(node.left, node.right, accept, (actual, expected) => ({
                        // (The use of "node.right" and "node.left" without casting is possible, since the type checks of the given properties for the actual inference rule are reused for the validation.)
                        message: `This comparison will always return '${node.operator === '==' ? 'false' : 'true'}' as '${node.left.$cstNode?.text}' and '${node.right.$cstNode?.text}' have the different types '${actual.name}' and '${expected.name}'.`,
                        languageNode: node, // mark the whole BinaryExpression
                        severity: 'warning',
                        // Langium-specific properties are usable, e.g. to enable a code action for this issue:
                        //  (The code action is not really helpful, but demonstrates, how to create a Langium code action for a validation issue created by Typir-Langium)
                        data: diagnosticData(node.operator === '==' ? TypeIssueCodes.ComparisonIsAlwaysFalse : TypeIssueCodes.ComparisonIsAlwaysTrue),
                    }))
                })
                .finish();
        }
        // = for SuperType = SubType (Note that this implementation of LOX realized assignments as operators!)
        typir.factory.Operators.createBinary({ name: '=', signature: { left: typeAny, right: typeAny, return: typeAny }})
            .inferenceRule({
                ...binaryInferenceRule,
                // this validation will be checked for each call of this operator!
                validation: (node, _opName, _opType, accept, typir) => typir.validation.Constraints.ensureNodeIsAssignable(node.right, node.left, accept, (actual, expected) => ({
                    message: `The expression '${node.right.$cstNode?.text}' of type '${actual.name}' is not assignable to '${node.left.$cstNode?.text}' with type '${expected.name}'`,
                    languageNode: node, languageProperty: 'right' }))})
            .finish();

        // unary operators
        typir.factory.Operators.createUnary({ name: '!', signature: { operand: typeBool, return: typeBool }}).inferenceRule(unaryInferenceRule).finish();
        typir.factory.Operators.createUnary({ name: '-', signature: { operand: typeNumber, return: typeNumber }}).inferenceRule(unaryInferenceRule).finish();

        // additional inference rules for ...
        typir.Inference.addInferenceRulesForAstNodes({
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
        typir.validation.Collector.addValidationRulesForLanguageNodes({
            ForStatement: this.validateCondition,
            IfStatement: this.validateCondition,
            ReturnStatement: this.validateReturnStatement,
            VariableDeclaration: this.validateVariableDeclaration,
            WhileStatement: this.validateCondition,
        });

        // check for unique function declarations
        typir.factory.Functions.createUniqueFunctionValidation({ registration: 'AUTO', languageKey: FunctionDeclaration.$type });

        // check for unique class declarations
        const uniqueClassValidator = typir.factory.Classes.createUniqueClassValidation({ registration: 'MANUAL' });
        // check for unique method declarations
        typir.factory.Classes.createUniqueMethodValidation({
            isMethodDeclaration: (node) => isMethodMember(node), // MethodMembers could have other $containers?
            getClassOfMethod: (method, _type) => method.$container,
            uniqueClassValidator: uniqueClassValidator,
            registration: 'AUTO', languageKey: MethodMember.$type,
        });
        typir.validation.Collector.addValidationRule(uniqueClassValidator, { languageKey: Class.$type }); // TODO this order is important, solve it in a different way!
        // check for cycles in super-sub-type relationships
        typir.factory.Classes.createNoSuperClassCyclesValidation({ registration: 'AUTO', languageKey: Class.$type });
    }

    onNewAstNode(node: AstNode, typir: TypirLangiumServices<LoxSpecifics>): void {
        // define types which are declared by the users of LOX => investigate the current AST

        // function types: they have to be updated after each change of the Langium document, since they are derived from FunctionDeclarations!
        if (isFunctionDeclaration(node)) {
            this.createFunctionDetails(node, typir); // this logic is reused for methods of classes, since the LOX grammar defines them very similar
        }

        // TODO support lambda (type references)!

        // class types (nominal typing):
        if (isClass(node)) {
            const className = node.name;
            const classType = typir.factory.Classes
                .create({
                    className,
                    superClasses: node.superClass?.ref, // note that type inference is used here
                    fields: node.members
                        .filter(isFieldMember) // only Fields, no Methods
                        .map(f => <CreateFieldDetails<LoxSpecifics>>{
                            name: f.name,
                            type: f.type, // note that type inference is used here
                        }),
                    methods: node.members
                        .filter(isMethodMember) // only Methods, no Fields
                        .map(member => <CreateMethodDetails<LoxSpecifics>>{ type: this.createFunctionDetails(member, typir) }), // same logic as for functions, since the LOX grammar defines them very similar
                    associatedLanguageNode: node, // this is used by the ScopeProvider to get the corresponding class declaration after inferring the (class) type of an expression
                })
                // inference rule for declaration
                .inferenceRuleForClassDeclaration({ languageKey: Class.$type, matching: languageNode => languageNode === node})
                // inference rule for constructor calls (i.e. class literals) conforming to the current class
                .inferenceRuleForClassLiterals({ // <InferClassLiteral<MemberCall>>
                    languageKey: MemberCall.$type,
                    matching: languageNode => isClass(languageNode.element?.ref) && languageNode.element!.ref.name === className && languageNode.explicitOperationCall,
                    inputValuesForFields: () => new Map(), // values for fields don't matter for nominal typing
                })
                .inferenceRuleForClassLiterals({ // <InferClassLiteral<TypeReference>>
                    languageKey: TypeReference.$type,
                    matching: languageNode => isClass(languageNode.reference?.ref) && languageNode.reference!.ref.name === className,
                    inputValuesForFields: () => new Map(), // values for fields don't matter for nominal typing
                })
                // inference rule for accessing fields
                .inferenceRuleForFieldAccess({
                    languageKey: MemberCall.$type,
                    matching: languageNode => isFieldMember(languageNode.element?.ref) && languageNode.element!.ref.$container === node && !languageNode.explicitOperationCall,
                    field: languageNode => languageNode.element!.ref!.name,
                })
                .finish();

            // explicitly declare, that 'nil' can be assigned to any Class variable
            classType.addListener(type => {
                typir.Conversion.markAsConvertible(typir.factory.Primitives.get({ primitiveName: 'nil' })!, type, 'IMPLICIT_EXPLICIT');
            });
            // The following idea does not work, since variables in LOX have a concrete class type and not an "any class" type:
            // typir.conversion.markAsConvertible(typeNil, this.classKind.getOrCreateTopClassType({}), 'IMPLICIT_EXPLICIT');
        }
    }

    protected createFunctionDetails(node: FunctionDeclaration | MethodMember, typir: TypirLangiumServices<LoxSpecifics>): TypeInitializer<FunctionType, LoxSpecifics> {
        const config = typir.factory.Functions
            .create({
                functionName: node.name,
                outputParameter: { name: NO_PARAMETER_NAME, type: node.returnType },
                inputParameters: node.parameters.map(p => (<CreateParameterDetails<LoxSpecifics>>{ name: p.name, type: p.type })),
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
                languageKey: MemberCall.$type,
                matching: (languageNode: MemberCall) => isFunctionDeclaration(languageNode.element?.ref)
                    && languageNode.explicitOperationCall && languageNode.element!.ref === node,
                inputArguments: (languageNode: MemberCall) => languageNode.arguments,
                validateArgumentsOfFunctionCalls: true,
            });
        } else if (isMethodMember(node)) {
            config.inferenceRuleForCalls({
                languageKey: MemberCall.$type,
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

    protected validateReturnStatement(node: ReturnStatement, accept: ValidationProblemAcceptor<LoxSpecifics>, typir: TypirServices<LoxSpecifics>): void {
        const callableDeclaration: FunctionDeclaration | MethodMember | undefined = AstUtils.getContainerOfType(node, node => isFunctionDeclaration(node) || isMethodMember(node));
        if (callableDeclaration && callableDeclaration.returnType.primitive && callableDeclaration.returnType.primitive !== 'void' && node.value) {
            // the return value must fit to the return type of the function / method
            typir.validation.Constraints.ensureNodeIsAssignable(node.value, callableDeclaration.returnType, accept, (actual, expected) => ({
                message: `The expression '${node.value!.$cstNode?.text}' of type '${actual.name}' is not usable as return value for the function '${callableDeclaration.name}' with return type '${expected.name}'.`,
                languageNode: node, languageProperty: 'value' }));
        }
    }

    protected validateVariableDeclaration(node: VariableDeclaration, accept: ValidationProblemAcceptor<LoxSpecifics>, typir: TypirServices<LoxSpecifics>): void {
        const typeVoid = typir.factory.Primitives.get({ primitiveName: 'void' })!;
        typir.validation.Constraints.ensureNodeHasNotType(node, typeVoid, accept,
            () => ({ message: "Variable can't be declared with a type 'void'.", languageNode: node, languageProperty: 'type' }));
        typir.validation.Constraints.ensureNodeIsAssignable(node.value, node, accept, (actual, expected) => ({
            message: `The expression '${node.value?.$cstNode?.text}' of type '${actual.name}' is not assignable to '${node.name}' with type '${expected.name}'`,
            languageNode: node, languageProperty: 'value' }));
    }

    protected validateCondition(node: IfStatement | WhileStatement | ForStatement, accept: ValidationProblemAcceptor<LoxSpecifics>, typir: TypirServices<LoxSpecifics>): void {
        const typeBool = typir.factory.Primitives.get({ primitiveName: 'boolean' })!;
        typir.validation.Constraints.ensureNodeIsAssignable(node.condition, typeBool, accept,
            () => ({ message: "Conditions need to be evaluated to 'boolean'.", languageNode: node, languageProperty: 'condition' }));
    }

}

export namespace TypeIssueCodes {
    export const ComparisonIsAlwaysTrue = 'condition-is-always-true';
    export const ComparisonIsAlwaysFalse = 'condition-is-always-false';
}
