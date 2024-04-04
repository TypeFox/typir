import type { ValidationAcceptor, ValidationChecks } from 'langium';
import type { OxAstType, VariableDeclaration } from './generated/ast.js';
import type { OxServices } from './ox-module.js';

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: OxServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.OxValidator;
    const checks: ValidationChecks<OxAstType> = {
        VariableDeclaration: validator.checkVoidAsVarDeclType
    };
    registry.register(checks, validator);
}

/**
 * Implementation of custom validations.
 */
export class OxValidator {
    checkVoidAsVarDeclType(varDecl: VariableDeclaration, accept: ValidationAcceptor) {
        if (varDecl.type.primitive === 'void') {
            accept('error', "Variable can\'n be declared with a type 'void'.", {
                node: varDecl,
                property: 'type'
            });
        }
    }
}

// todo: validate types of function parameters and function call arguments
// todo: implement typechecker
// todo: veryfy return type and return expression