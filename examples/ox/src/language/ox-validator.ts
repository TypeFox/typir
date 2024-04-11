/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { AstUtils, type AstNode, type ValidationAcceptor, type ValidationChecks } from 'langium';
import { isFunctionDeclaration, type AssignmentStatement, type Expression, type OxAstType, type ReturnStatement, type VariableDeclaration, FunctionDeclaration } from './generated/ast.js';
import type { OxServices } from './ox-module.js';
import { createTypir } from './ox-type-checking.js';
import { isFunctionKind } from 'typir';

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: OxServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.OxValidator;
    const checks: ValidationChecks<OxAstType> = {
        VariableDeclaration: [
            validator.checkVoidAsVarDeclType,
            validator.checkAssignedTypeForVariableDeclaration
        ],
        Expression: validator.checkExpressionHasType,
        IfStatement: validator.checkConditionExpressionIsBoolean,
        WhileStatement: validator.checkConditionExpressionIsBoolean,
        ForStatement: validator.checkConditionExpressionIsBoolean,
        AssignmentStatement: validator.checkAssignedTypeForStatement,
        ReturnStatement: validator.checkReturnTypeIsCorrect,
        FunctionDeclaration: validator.checkFunctionDeclarationHasType
    };
    registry.register(checks, validator);
}

/**
 * Implementation of custom validations.
 */
export class OxValidator {
    checkVoidAsVarDeclType(varDecl: VariableDeclaration, accept: ValidationAcceptor) {
        if (varDecl.type.primitive === 'void') {
            accept('error', "Variable can't be declared with a type 'void'.", {
                node: varDecl,
                property: 'type'
            });
        }
    }

    checkExpressionHasType(node: Expression, accept: ValidationAcceptor) {
        const typir = createTypir(node);
        const type = typir.inference.inferType(node);
        if (type) {
            // the expression has an (inferred) type => everything is fine
        } else {
            accept('error', `It was not possible to infer the type for this expression '${node.$type}' (${node.$cstNode?.text}).`, { node });
        }
    }

    // TODO how to realise useful error messages for failing inferType()? operators + functions should provide a message, when the types of their operands do not match!

    checkFunctionDeclarationHasType(node: FunctionDeclaration, accept: ValidationAcceptor) {
        const typir = createTypir(node);
        const type = typir.inference.inferType(node);
        if (type) {
            if (isFunctionKind(type.kind)) {
                // the function has an (inferred) function type => everything is fine
            } else {
                accept('error', `The inferred type '${type.getUserRepresentation()}' of this function '${node.name}' is no function type but of kind '${type.kind.$name}'.`, { node });
            }
        } else {
            accept('error', `It was not possible to infer the type for this function '${node.name}'.`, { node });
        }
    }

    /*
     * TODO validation with Typir for Langium
     * - Extra-Package "typir-langium" anlegen
     * - überhaupt Type ableitbar? Type vs undefined
     * - passt der abgeleitete Type zur Umgebung? => "type checking" (expected: unknown|Type, actual: unknown|Type)
     * - hübsche und konfigurierbare Fehlermeldung produzieren
     * - einfach in Validator einhängbar machen
     * - Service, um Typir zentral im Hintergrund zu haben und zu cachen; interne Caches von Typir selbst müssen aber ggfs. geleert werden, wenn ein Dokument sich geändert hat!
     * - possible Quick-fixes ...
     *     - for wrong type of variable declaration
     *     - to add missing explicit type conversion
     * - const ref: (kind: unknown) => kind is FunctionKind = isFunctionKind; // diese Signatur irgendwie nutzen, ggfs. nur bei/für Langium?
     */

    checkConditionExpressionIsBoolean(node: AstNode & { condition?: Expression }, accept: ValidationAcceptor) {
        if (node.condition) {
            const typir = createTypir(node);
            const type = typir.inference.inferType(node.condition);
            if (type) {
                if (type !== typir.graph.getType('boolean')) {
                    accept('error', `Conditions need to be evaluated to 'boolean', but '${type.name}' is actually used here.`, { node, property: 'condition' });
                }
            }
        }
    }

    checkReturnTypeIsCorrect(node: ReturnStatement, accept: ValidationAcceptor) {
        const functionDeclaration = AstUtils.getContainerOfType(node, isFunctionDeclaration);
        if (functionDeclaration) {
            if (functionDeclaration.returnType.primitive === 'void') {
                // no return type
                if (node.value) {
                    accept('error', `The function '${functionDeclaration.name}' has 'void' as return type. Therefore, this return statement must return no value.`, { node, property: 'value' });
                } else {
                    // no value => everything is fine
                }
            } else {
                // return type existing
                if (node.value) {
                    const typir = createTypir(node);
                    const functionType = typir.inference.inferType(functionDeclaration);
                    const valueType = typir.inference.inferType(node.value);
                    if (functionType && valueType) {
                        if (isFunctionKind(functionType.kind)) {
                            const returnType = functionType.kind.getOutput(functionType)?.type;
                            if (returnType) {
                                const assignConflicts = typir.assignability.isAssignable(valueType, returnType);
                                if (assignConflicts.length >= 1) {
                                    accept('error', `This expression of type '${valueType.name}' is not assignable to '${returnType.name}' as the return type of the function '${functionDeclaration.name}':\n${typir.conflictPrinter.printTypeConflicts(assignConflicts)}`, { node, property: 'value' });
                                } else {
                                    // everything is fine!
                                }
                            } else {
                                throw new Error('The function type must have a return type!');
                            }
                        } else {
                            // this will be checked at another location
                        }
                    } else {
                        // ignore this
                    }
                } else {
                    // missing return value
                    accept('error', `The function '${functionDeclaration.name}' has '${functionDeclaration.returnType.primitive}' as return type. Therefore, this return statement must return value.`, { node });
                }
            }
        }
    }

    checkAssignedTypeForVariableDeclaration(node: VariableDeclaration, accept: ValidationAcceptor) {
        this.checkAssignment(node, node.value, accept);
    }

    checkAssignedTypeForStatement(node: AssignmentStatement, accept: ValidationAcceptor) {
        this.checkAssignment(node.varRef.ref, node.value, accept);
    }

    protected checkAssignment(variable: VariableDeclaration | undefined, value: Expression | undefined, accept: ValidationAcceptor) {
        if (!variable || !value) {
            return;
        }
        const typir = createTypir(variable);
        const variableType = typir.inference.inferType(variable);
        const valueType = typir.inference.inferType(value);
        if (variableType && valueType) {
            const assignConflicts = typir.assignability.isAssignable(valueType, variableType);
            if (assignConflicts.length >= 1) {
                accept('error', `This expression of type '${valueType.name}' is not assignable to '${variableType.name}':\n${typir.conflictPrinter.printTypeConflicts(assignConflicts)}`, { node: value });
            }
        }
    }
}
