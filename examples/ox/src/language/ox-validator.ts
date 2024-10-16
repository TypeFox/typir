/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { AstUtils, type ValidationAcceptor, type ValidationChecks } from 'langium';
import { isFunctionDeclaration, type OxAstType, type ReturnStatement } from './generated/ast.js';
import type { OxServices } from './ox-module.js';

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: OxServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.OxValidator;
    const checks: ValidationChecks<OxAstType> = {
        ReturnStatement: validator.checkReturnTypeIsCorrect,
    };
    registry.register(checks, validator);
}

/**
 * Implementation of custom validations on the syntactic level (which can be checked without using Typir).
 * Validations on type level are done by Typir.
 */
export class OxValidator {

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
                    // the validation that return value fits to return type is done by Typir, not here
                } else {
                    // missing return value
                    accept('error', `The function '${functionDeclaration.name}' has '${functionDeclaration.returnType.primitive}' as return type. Therefore, this return statement must return value.`, { node });
                }
            }
        }
    }

}
