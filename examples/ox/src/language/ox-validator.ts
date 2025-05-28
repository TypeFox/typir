/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import {
    AstUtils,
    MultiMap,
    type ValidationAcceptor,
    type ValidationChecks,
} from "langium";
import {
    FunctionDeclaration,
    isFunctionDeclaration,
    isVariableDeclaration,
    OxElement,
    OxProgram,
    VariableDeclaration,
    type OxAstType,
    type ReturnStatement,
} from "./generated/ast.js";
import type { OxServices } from "./ox-module.js";

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: OxServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.OxValidator;
    const checks: ValidationChecks<OxAstType> = {
        ReturnStatement: validator.checkReturnTypeIsCorrect,
        OxProgram: [
            validator.checkUniqueVariableNames,
            validator.checkUniqueFunctionNames,
        ],
        Block: validator.checkUniqueVariableNames,
    };
    registry.register(checks, validator);
}

/**
 * Implementation of custom validations on the syntactic level (which can be checked without using Typir).
 * Validations on type level are done by Typir.
 */
export class OxValidator {
    checkReturnTypeIsCorrect(
        node: ReturnStatement,
        accept: ValidationAcceptor,
    ) {
        const functionDeclaration = AstUtils.getContainerOfType(
            node,
            isFunctionDeclaration,
        );
        if (functionDeclaration) {
            if (functionDeclaration.returnType.primitive === "void") {
                // no return type
                if (node.value) {
                    accept(
                        "error",
                        `The function '${functionDeclaration.name}' has 'void' as return type. Therefore, this return statement must return no value.`,
                        { node, property: "value" },
                    );
                } else {
                    // no value => everything is fine
                }
            } else {
                // return type existing
                if (node.value) {
                    // the validation that return value fits to return type is done by Typir, not here
                } else {
                    // missing return value
                    accept(
                        "error",
                        `The function '${functionDeclaration.name}' has '${functionDeclaration.returnType.primitive}' as return type. Therefore, this return statement must return value.`,
                        { node },
                    );
                }
            }
        }
    }

    checkUniqueVariableNames(
        block: { elements: OxElement[] },
        accept: ValidationAcceptor,
    ): void {
        const variables: Map<string, VariableDeclaration[]> = new Map();
        for (const v of block.elements) {
            if (isVariableDeclaration(v)) {
                const key = v.name;
                let entries = variables.get(key);
                if (!entries) {
                    entries = [];
                    variables.set(key, entries);
                }
                entries.push(v);
            }
        }
        for (const [name, vars] of variables.entries()) {
            if (vars.length >= 2) {
                for (const v of vars) {
                    accept(
                        "error",
                        "Variables need to have unique names: " + name,
                        {
                            node: v,
                            property: "name",
                        },
                    );
                }
            }
        }
    }

    checkUniqueFunctionNames(
        root: OxProgram,
        accept: ValidationAcceptor,
    ): void {
        const mappedFunctions: MultiMap<string, FunctionDeclaration> =
            new MultiMap();
        root.elements
            .filter(isFunctionDeclaration)
            .forEach((decl) => mappedFunctions.add(decl.name, decl));
        for (const [
            name,
            declarations,
        ] of mappedFunctions.entriesGroupedByKey()) {
            if (declarations.length >= 2) {
                for (const f of declarations) {
                    accept(
                        "error",
                        "Functions need to have unique names: " + name,
                        {
                            node: f,
                            property: "name",
                        },
                    );
                }
            }
        }
    }
}
