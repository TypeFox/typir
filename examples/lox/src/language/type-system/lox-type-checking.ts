/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
******************************************************************************/

import { AstNode, AstUtils, assertUnreachable, isAstNode } from 'langium';
import { ClassKind, DefaultTypeConflictPrinter, FUNCTION_MISSING_NAME, FunctionKind, InferOperatorWithMultipleOperands, InferOperatorWithSingleOperand, NameTypePair, PrimitiveKind, TopKind, Type, Typir } from 'typir';
import { BinaryExpression, FieldMember, MemberCall, TypeReference, UnaryExpression, isBinaryExpression, isBooleanExpression, isClass, isClassMember, isFieldMember, isForStatement, isFunctionDeclaration, isIfStatement, isLoxProgram, isMemberCall, isMethodMember, isNilExpression, isNumberExpression, isParameter, isPrintStatement, isReturnStatement, isStringExpression, isTypeReference, isUnaryExpression, isVariableDeclaration, isWhileStatement } from '../generated/ast.js';

export function createTypir(domainNodeEntry: AstNode): Typir {
    // set up Typir and reuse some predefined things
    const typir = new Typir();
    const primitiveKind = new PrimitiveKind(typir);
    const functionKind = new FunctionKind(typir);
    const classKind = new ClassKind(typir, {
        typing: 'Nominal',
    });
    const anyKind = new TopKind(typir);
    const operators = typir.operators;

    // primitive types
    // typeBool, typeNumber and typeVoid are specific types for OX, ...
    const typeBool = primitiveKind.createPrimitiveType({ primitiveName: 'boolean',
        inferenceRules: [
            (node: unknown) => isBooleanExpression(node),
            (node: unknown) => isTypeReference(node) && node.primitive === 'boolean'
        ]});
    // ... but their primitive kind is provided/preset by Typir
    const typeNumber = primitiveKind.createPrimitiveType({ primitiveName: 'number',
        inferenceRules: [
            (node: unknown) => isNumberExpression(node),
            (node: unknown) => isTypeReference(node) && node.primitive === 'number'
        ]});
    const typeString = primitiveKind.createPrimitiveType({ primitiveName: 'string',
        inferenceRules: [
            (node: unknown) => isStringExpression(node),
            (node: unknown) => isTypeReference(node) && node.primitive === 'string'
        ]});
    const typeVoid = primitiveKind.createPrimitiveType({ primitiveName: 'void',
        inferenceRules: [
            (node: unknown) => isTypeReference(node) && node.primitive === 'void',
            (node: unknown) => isPrintStatement(node),
            (node: unknown) => isReturnStatement(node) && node.value === undefined
        ] });
    const typeNil = primitiveKind.createPrimitiveType({ primitiveName: 'nil',
        inferenceRules: (node: unknown) => isNilExpression(node) }); // TODO for what is this used?
    const typeAny = anyKind.createTopType({});

    // utility function to map language types to Typir types
    // TODO get rid of these type dispatch!
    function mapType(typeRef: TypeReference): Type {
        if (!typeRef) {
            throw new Error('a type reference must be given');
        }
        if (typeRef.primitive) {
            switch (typeRef.primitive) {
                case 'number': return typeNumber;
                case 'string': return typeString;
                case 'boolean': return typeBool;
                case 'void': return typeVoid;
                default: assertUnreachable(typeRef.primitive);
            }
        } else if (typeRef.reference && typeRef.reference.ref) {
            // search for an existing class
            const classType = classKind.getClassType(typeRef.reference.ref.name);
            if (classType) {
                return classType;
            } else {
                throw new Error();
            }
        } else {
            // search for an existing function
            // TODO lambda vs function
            const functionType = functionKind.getFunctionType({
                functionName: 'TODO',
                inputParameters: [], // TODO
                outputParameter: undefined, // TODO
            });
            if (functionType) {
                return functionType;
            } else {
                throw new Error();
            }
        }
    }

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
    operators.createBinaryOperator({ name: ['+', '-', '*', '/'], inputTypeLeftAndRightAndOutput: typeNumber, inferenceRule: binaryInferenceRule });
    operators.createBinaryOperator({ name: '+', inputTypeLeftAndRightAndOutput: typeString, inferenceRule: binaryInferenceRule });
    // TODO '+' with mixed types!

    // binary operators: numbers => boolean
    operators.createBinaryOperator({ name: ['<', '<=', '>', '>='], inputTypeLeftAndRight: typeNumber, outputType: typeBool, inferenceRule: binaryInferenceRule });

    // binary operators: booleans => boolean
    operators.createBinaryOperator({ name: ['and', 'or'], inputTypeLeftAndRightAndOutput: typeBool, inferenceRule: binaryInferenceRule });

    // ==, != for all data types (the warning for different types is realized below)
    operators.createBinaryOperator({ name: ['==', '!='], inputTypeLeftAndRight: typeAny, outputType: typeBool, inferenceRule: binaryInferenceRule });
    // = for SuperType = SubType (TODO integrate the validation here? should be replaced!)
    operators.createBinaryOperator({ name: '=', inputTypeLeftAndRightAndOutput: typeAny, inferenceRule: binaryInferenceRule });

    // unary operators
    operators.createUnaryOperator({ name: '!', operandType: typeBool, inferenceRule: unaryInferenceRule });
    operators.createUnaryOperator({ name: ['-', '+'], operandType: typeNumber, inferenceRule: unaryInferenceRule });

    // define types which are declared by the users of LOX => investigate the current AST
    const domainNodeRoot = AstUtils.getContainerOfType(domainNodeEntry, isLoxProgram)!;
    AstUtils.streamAllContents(domainNodeRoot).forEach((node: AstNode) => {
        // function types: they have to be updated after each change of the Langium document, since they are derived from FunctionDeclarations!
        if (isFunctionDeclaration(node)) {
            const functionName = node.name;
            // define function type
            functionKind.createFunctionType({
                functionName,
                outputParameter: { name: FUNCTION_MISSING_NAME, type: mapType(node.returnType) },
                inputParameters: node.parameters.map(p => (<NameTypePair>{ name: p.name, type: mapType(p.type) })),
                // inference rule for function declaration:
                inferenceRuleForDeclaration: (domainElement: unknown) => domainElement === node, // only the current function declaration matches!
                /** inference rule for funtion calls:
                 * - inferring of overloaded functions works only, if the actual arguments have the expected types!
                 * - (inferring calls to non-overloaded functions works independently from the types of the given parameters)
                 * - additionally, validations for the assigned values to the expected parameter( type)s are derived */
                inferenceRuleForCalls: {
                    filter: isMemberCall,
                    matching: (domainElement: MemberCall) => isFunctionDeclaration(domainElement.element?.ref) && domainElement.element!.ref.name === functionName,
                    inputArguments: (domainElement: MemberCall) => domainElement.arguments
                },
            });
        }

        // TODO support lambda (type references)!

        /**
         * TODO Delayed:
         * - (classType: Type) => Type(for output)
         * - WANN werden sie aufgelöst? bei erster Verwendung?
         * - WO wird das verwaltet? im Kind? im Type? im TypeGraph?
         */

        // class types (nominal typing):
        if (isClass(node)) {
            const className = node.name;
            classKind.createClassType({
                className,
                superClasses: node.superClass?.ref ? classKind.getClassType(node.superClass.ref.name) : undefined, // TODO delayed
                fields: node.members
                    .filter(m => isFieldMember(m)).map(f => f as FieldMember) // only Fields, no Methods
                    .map(f => <NameTypePair>{
                        name: f.name,
                        type: mapType(f.type), // TODO delayed
                    }),
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
                    ? domainElement.element!.ref.name : 'RULE_NOT_APPLICABLE',
            });
        }
    });

    // additional inference rules for ...
    typir.inference.addInferenceRule({
        isRuleApplicable(domainElement: unknown) {
            // ... member calls
            if (isMemberCall(domainElement)) {
                const ref = domainElement.element?.ref;
                if (isClass(ref)) {
                    return 'RULE_NOT_APPLICABLE'; // not required anymore
                } else if (isClassMember(ref)) {
                    return undefined!; //TODO
                } else if (isMethodMember(ref)) {
                    return undefined!; //TODO
                } else if (isVariableDeclaration(ref)) {
                    // use variables inside expressions!
                    return ref.type!;
                } else if (isParameter(ref)) {
                    // use parameters inside expressions
                    return ref.type;
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
                if (domainElement.type) {
                    return domainElement.type;
                } else if (domainElement.value) {
                    // the type might be null; no type declared => do type inference of the assigned value instead!
                    return domainElement.value;
                } else {
                    return 'RULE_NOT_APPLICABLE'; // this case is impossible, there is a validation in the "usual LOX validator" for this case
                }
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
            if (isBinaryExpression(node) && node.operator === '=') {
                return typir.validation.constraints.ensureNodeIsAssignable(node.right, node.left, `The expression '${node.right.$cstNode?.text}' is not assignable to '${node.left}'`, 'value');
            }
            if (isBinaryExpression(node) && (node.operator === '==' || node.operator === '!=')) {
                // TODO use inferred types in the message
                const msg = `This comparison will always return '${node.operator === '==' ? 'false' : 'true'}' as '${node.left.$cstNode?.text}' and '${node.right.$cstNode?.text}' have different types.`;
                // TODO mark the 'operator' property!
                return typir.validation.constraints.ensureNodeIsEquals(node.right, node.left, msg, undefined, 'warning');
            }
            if (isReturnStatement(node)) {
                const functionDeclaration = AstUtils.getContainerOfType(node, isFunctionDeclaration);
                if (functionDeclaration && functionDeclaration.returnType.primitive && functionDeclaration.returnType.primitive !== 'void' && node.value) {
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
