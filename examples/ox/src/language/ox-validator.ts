/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import type { AstNode, ValidationAcceptor, ValidationChecks } from 'langium';
import type { AssignmentStatement, Expression, OxAstType, VariableDeclaration } from './generated/ast.js';
import type { OxServices } from './ox-module.js';
import { createTypir } from './ox-type-checking.js';

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: OxServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.OxValidator;
    const checks: ValidationChecks<OxAstType> = {
        VariableDeclaration: [
            validator.checkVoidAsVarDeclType,
            validator.checkAssignVariableDeclaration
        ],
        Expression: validator.checkExpressionHasType,
        IfStatement: validator.checkConditionExpressionIsBoolean,
        WhileStatement: validator.checkConditionExpressionIsBoolean,
        ForStatement: validator.checkConditionExpressionIsBoolean,
        AssignmentStatement: validator.checkAssignStatement
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
        const typir = createTypir();
        const type = typir.inference.inferType(node);
        if (type) {
            // if (type.name !== 'boolean') {
            //     accept('error', `No boolean type, but ${type.name}`, { node });
            // } else {
            //      accept('warning', `Found ${type.name} type!`, { node });
            // }
        } else {
            accept('error', `It was not possible to infer the type for '${node.$type}'.`, { node });
        }
    }

    checkConditionExpressionIsBoolean(node: AstNode & { condition?: Expression }, accept: ValidationAcceptor) {
        if (node.condition) {
            const typir = createTypir();
            const type = typir.inference.inferType(node.condition);
            if (type) {
                if (type.name !== 'boolean') {
                    accept('error', `Conditions need to be evaluated to 'boolean', but '${type.name}' is actually used here.`, { node, property: 'condition' });
                }
            }
        }
    }

    checkAssignVariableDeclaration(node: VariableDeclaration, accept: ValidationAcceptor) {
        this.checkAssignment(node, node.value, accept);
    }

    checkAssignStatement(node: AssignmentStatement, accept: ValidationAcceptor) {
        this.checkAssignment(node.varRef.ref, node.value, accept);
    }

    protected checkAssignment(variable: VariableDeclaration | undefined, value: Expression | undefined, accept: ValidationAcceptor) {
        if (!variable || !value) {
            return;
        }
        const typir = createTypir();
        const variableType = typir.inference.inferType(variable);
        const valueType = typir.inference.inferType(value);
        if (variableType && valueType) {
            const assignable = typir.assignability.isAssignable(valueType, variableType);
            if (assignable.length >= 1) {
                // TODO bessere Fehlermeldungen !!
                accept('error', `This expression of type '${valueType.name}' is not assignable to '${variableType.name}': TODO`, { node: value });
            }
        }
    }
}
