/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import {
    ValidationAcceptor,
    ValidationChecks,
    ValidationRegistry,
} from "langium";
import { LoxAstType, VariableDeclaration } from "./generated/ast.js";
import type { LoxServices } from "./lox-module.js";

/**
 * Registry for validation checks.
 */
export class LoxValidationRegistry extends ValidationRegistry {
    constructor(services: LoxServices) {
        super(services);
        const validator = services.validation.LoxValidator;
        const checks: ValidationChecks<LoxAstType> = {
            VariableDeclaration: validator.checkVariableDeclaration,
        };
        this.register(checks, validator);
    }
}

/**
 * Implementation of custom validations on the syntactic level (which can be checked without using Typir).
 * Validations on type level are done by Typir.
 */
export class LoxValidator {
    checkVariableDeclaration(
        decl: VariableDeclaration,
        accept: ValidationAcceptor,
    ): void {
        if (!decl.type && !decl.value) {
            accept(
                "error",
                "Variables require a type hint or an assignment at creation",
                {
                    node: decl,
                    property: "name",
                },
            );
        }
    }
}
