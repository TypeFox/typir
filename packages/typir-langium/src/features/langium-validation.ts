/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { ValidationChecks, AstNode, ValidationAcceptor } from 'langium';
import { LangiumServices } from 'langium/lsp';
import { TypirServices } from 'typir';
import { LangiumServicesForTypirBinding } from '../typir-langium.js';

export function registerTypirValidationChecks(services: LangiumServices & LangiumServicesForTypirBinding) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.TypeValidation;
    const checks: ValidationChecks<object> = {
        AstNode: validator.checkTypingProblemsWithTypir, // TODO checking each node is not performant, improve the API!
    };
    registry.register(checks, validator);
}

/*
* TODO validation with Typir for Langium
* - Is it possible to infer a type at all? Type vs undefined
* - Does the inferred type fit to the environment? => "type checking" (expected: unknown|Type, actual: unknown|Type)
* - provide service to cache Typir in the background; but ensure, that internal caches of Typir need to be cleared, if a document was changed
* - possible Quick-fixes ...
*     - for wrong type of variable declaration
*     - to add missing explicit type conversion
* - const ref: (kind: unknown) => kind is FunctionKind = isFunctionKind; // use this signature for Langium?
* - no validation of parents, when their children already have some problems/warnings
*/

export class LangiumTypirValidator {
    protected readonly services: TypirServices;

    constructor(services: LangiumServicesForTypirBinding) {
        this.services = services.Typir;
    }

    /**
     * Executes all checks, which are directly derived from the current Typir configuration,
     * i.e. arguments fit to parameters for function calls (including operands for operators).
     * @param node the current AST node to check regarding typing issues
     * @param accept receives the found validation hints
     */
    checkTypingProblemsWithTypir(node: AstNode, accept: ValidationAcceptor) {
        const typeProblems = this.services.validation.collector.validate(node);
        // print all found problems for the given AST node
        for (const problem of typeProblems) {
            const message = this.services.printer.printValidationProblem(problem);
            accept(problem.severity, message, { node, property: problem.domainProperty, index: problem.domainIndex });
        }
    }

}
