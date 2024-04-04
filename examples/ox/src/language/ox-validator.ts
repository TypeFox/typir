/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import type { ValidationAcceptor, ValidationChecks } from 'langium';
import type { Expression, OxAstType, VariableDeclaration } from './generated/ast.js';
import type { OxServices } from './ox-module.js';
import { createTypir } from './ox-type-checking.js';

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: OxServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.OxValidator;
    const checks: ValidationChecks<OxAstType> = {
        VariableDeclaration: validator.checkVoidAsVarDeclType,
        Expression: validator.checkExpressionTypes
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

    checkExpressionTypes(node: Expression, accept: ValidationAcceptor) {
        const typir = createTypir();
        const type = typir.inference.inferType(node);
        if (type) {
            // if (type.name !== 'boolean') {
            //     accept('error', `No boolean type, but ${type.name}`, { node });
            // } else {
            //      accept('warning', `Found ${type.name} type!`, { node });
            // }
        } else {
            accept('error', `Missing type inference for '${node.$type}'`, { node });
        }
    }
}

// todo: validate types of function parameters and function call arguments
// todo: implement typechecker
// todo: verify return type and return expression
