/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { AstNode, AstUtils, ValidationAcceptor, ValidationChecks } from 'langium';
import { LangiumServices } from 'langium/lsp';
import { TypirServices, ValidationProblem } from 'typir';
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
        this.services = services;
    }

    /**
     * Executes all checks, which are directly derived from the current Typir configuration,
     * i.e. arguments fit to parameters for function calls (including operands for operators).
     * @param node the current AST node to check regarding typing issues
     * @param accept receives the found validation hints
     */
    checkTypingProblemsWithTypir(node: AstNode, accept: ValidationAcceptor) {
        // TODO use the new validation registry API in Langium v3.3 instead!
        if (node.$container === undefined) {
            this.report(this.services.validation.collector.validateBefore(node), node, accept);

            AstUtils.streamAst(node).forEach(child => {
                this.report(this.services.validation.collector.validate(child), child, accept);
            });

            this.report(this.services.validation.collector.validateAfter(node), node, accept);
        }
    }

    protected report(problems: ValidationProblem[], node: AstNode, accept: ValidationAcceptor): void {
        // print all found problems for the given AST node
        for (const problem of problems) {
            const message = this.services.printer.printValidationProblem(problem);
            accept(problem.severity, message, { node, property: problem.domainProperty, index: problem.domainIndex });
        }
    }
}
