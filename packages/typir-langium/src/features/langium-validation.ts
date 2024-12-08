/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { AstNode, LangiumDefaultCoreServices, ValidationAcceptor, ValidationChecks } from 'langium';
import { TypirServices, ValidationProblem } from 'typir';
import { LangiumServicesForTypirBinding } from '../typir-langium.js';

export function registerTypirValidationChecks(services: LangiumDefaultCoreServices & LangiumServicesForTypirBinding) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.TypeValidation;
    registry.registerBeforeDocument(validator.checkTypingProblemsWithTypirBeforeDocument, validator);
    const checks: ValidationChecks<object> = {
        AstNode: validator.checkTypingProblemsWithTypir, // checking each node is not performant, improve the API, see below!
    };
    registry.register(checks, validator);
    registry.registerAfterDocument(validator.checkTypingProblemsWithTypirAfterDocument, validator);
}

/*
* TODO Ideas and features for the validation with Typir for Langium
*
* What to validate:
* - Is it possible to infer a type at all? Type vs undefined
* - Does the inferred type fit to the environment? => "type checking" (expected: unknown|Type, actual: unknown|Type)
* - possible Quick-fixes ...
*     - for wrong type of variable declaration
*     - to add missing explicit type conversion
* - no validation of parents, when their children already have some problems/warnings
*
* Improved Validation API for Langium:
* - const ref: (kind: unknown) => kind is FunctionKind = isFunctionKind; // use this signature for Langium?
* - register validations for AST node $types (similar as Langium does it) => this is much more performant
* - [<VariableDeclaration>{ selector: isVariableDeclaration, result: domainElement => domainElement.type }, <BinaryExpression>{}]      Array<InferenceRule<T>>
* - discriminator rule: $type '$VariableDeclaration' + record / "Sprungtabelle" for the Langium-binding (or both in core)? for improved performance (?)
* - alternativ discriminator rule: unknown => string; AstNode => node.$type; Vorsicht mit Sub-Typen (Vollständigkeit+Updates, no abstract types)!
* Apply the same ideas for InferenceRules as well!
*/

export interface LangiumTypirValidator {
    /**
     * Will be called once before starting the validation of a LangiumDocument.
     * @param rootNode the root node of the current document
     * @param accept receives the found validation hints
     */
    checkTypingProblemsWithTypirBeforeDocument(rootNode: AstNode, accept: ValidationAcceptor): void;

    /**
     * Executes all checks, which are directly derived from the current Typir configuration,
     * i.e. checks that arguments fit to parameters for function calls (including operands for operators).
     * @param node the current AST node to check regarding typing issues
     * @param accept receives the found validation hints
     */
    checkTypingProblemsWithTypir(node: AstNode, accept: ValidationAcceptor): void;

    /**
     * Will be called once after finishing the validation of a LangiumDocument.
     * @param rootNode the root node of the current document
     * @param accept receives the found validation hints
     */
    checkTypingProblemsWithTypirAfterDocument(rootNode: AstNode, accept: ValidationAcceptor): void;
}

export class DefaultLangiumTypirValidator implements LangiumTypirValidator {
    protected readonly services: TypirServices;

    constructor(services: LangiumServicesForTypirBinding) {
        this.services = services;
    }

    checkTypingProblemsWithTypirBeforeDocument(rootNode: AstNode, accept: ValidationAcceptor): void {
        this.report(this.services.validation.collector.validateBefore(rootNode), rootNode, accept);
    }

    checkTypingProblemsWithTypir(node: AstNode, accept: ValidationAcceptor) {
        this.report(this.services.validation.collector.validate(node), node, accept);
    }

    checkTypingProblemsWithTypirAfterDocument(rootNode: AstNode, accept: ValidationAcceptor): void {
        this.report(this.services.validation.collector.validateAfter(rootNode), rootNode, accept);
    }

    protected report(problems: ValidationProblem[], node: AstNode, accept: ValidationAcceptor): void {
        // print all found problems for the given AST node
        for (const problem of problems) {
            const message = this.services.printer.printValidationProblem(problem);
            accept(problem.severity, message, { node, property: problem.domainProperty, index: problem.domainIndex });
        }
    }
}
