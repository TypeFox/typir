/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { AstNode, AstUtils, ValidationAcceptor, ValidationChecks, ValidationRegistry } from 'langium';
import { BinaryExpression, Class, ExpressionBlock, FunctionDeclaration, isReturnStatement, LoxAstType, LoxProgram, MethodMember, TypeReference, UnaryExpression, VariableDeclaration } from './generated/ast.js';
import type { LoxServices } from './lox-module.js';
import { isAssignable } from './type-system/assignment.js';
import { isVoidType, TypeDescription, typeToString } from './type-system/descriptions.js';
import { inferType } from './type-system/infer.js';
import { isLegalOperation } from './type-system/operator.js';
import { createTypir } from './type-system/lox-type-checking.js';

/**
 * Registry for validation checks.
 */
export class LoxValidationRegistry extends ValidationRegistry {
    constructor(services: LoxServices) {
        super(services);
        const validator = services.validation.LoxValidator;
        const checks: ValidationChecks<LoxAstType> = {
            BinaryExpression: validator.checkBinaryOperationAllowed,
            VariableDeclaration: validator.checkVariableDeclaration,
            LoxProgram: validator.checkTypingProblemsWithTypir,
        };
        this.register(checks, validator);
    }
}

/**
 * Implementation of custom validations.
 */
export class LoxValidator {

    checkTypingProblemsWithTypir(node: LoxProgram, accept: ValidationAcceptor) {
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

    checkVariableDeclaration(decl: VariableDeclaration, accept: ValidationAcceptor): void {
        if (!decl.type && !decl.value) {
            accept('error', 'Variables require a type hint or an assignment at creation', {
                node: decl,
                property: 'name'
            });
        }
    }

    checkBinaryOperationAllowed(binary: BinaryExpression, accept: ValidationAcceptor): void {
        const map = this.getTypeCache();
        const left = inferType(binary.left, map);
        const right = inferType(binary.right, map);
        if (!isLegalOperation(binary.operator, left, right)) {
            // accept('error', `Cannot perform operation '${binary.operator}' on values of type '${typeToString(left)}' and '${typeToString(right)}'.`, {
            //     node: binary
            // })
        } else if (binary.operator === '=') {
            // if (!isAssignable(right, left)) {
            //     accept('error', `Type '${typeToString(right)}' is not assignable to type '${typeToString(left)}'.`, {
            //         node: binary,
            //         property: 'right'
            //     })
            // }
        } else if (['==', '!='].includes(binary.operator)) {
            if (!isAssignable(right, left)) {
                accept('warning', `This comparison will always return '${binary.operator === '==' ? 'false' : 'true'}' as types '${typeToString(left)}' and '${typeToString(right)}' are not compatible.`, {
                    node: binary,
                    property: 'operator'
                });
            }
        }
    }

    private getTypeCache(): Map<AstNode, TypeDescription> {
        return new Map();
    }

}
