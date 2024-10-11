/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { AstUtils, type ValidationAcceptor, type ValidationChecks } from 'langium';
import { OxProgram, isFunctionDeclaration, type OxAstType, type ReturnStatement } from './generated/ast.js';
import type { OxServices } from './ox-module.js';
import { createTypir } from './ox-type-checking.js';

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: OxServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.OxValidator;
    const checks: ValidationChecks<OxAstType> = {
        ReturnStatement: validator.checkReturnTypeIsCorrect,
        OxProgram: validator.checkTypingProblemsWithTypir
    };
    registry.register(checks, validator);
}

/**
 * Implementation of custom validations.
 */
export class OxValidator {

    checkTypingProblemsWithTypir(node: OxProgram, accept: ValidationAcceptor) {
        // executes all checks, which are directly derived from the current Typir configuration,
        // i.e. arguments fit to parameters for function calls (including operands for operators)
        const typir = createTypir(node);
        AstUtils.streamAllContents(node).forEach(node => {
            // print all found problems for each AST node
            const typeProblems = typir.validation.collector.validate(node);
            for (const problem of typeProblems) {
                const message = typir.printer.printValidationProblem(problem);
                accept(problem.severity, message, { node, property: problem.domainProperty, index: problem.domainIndex });
            }
        });
    }

    checkReturnTypeIsCorrect(node: ReturnStatement, accept: ValidationAcceptor) {
        // these checks are done here, since these issues already influence the syntactic level (which can be checked without using Typir)
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
