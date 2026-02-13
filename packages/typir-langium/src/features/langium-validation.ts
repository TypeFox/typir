/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { LangiumDefaultCoreServices, Properties, ValidationAcceptor, ValidationChecks } from 'langium';
import { DefaultValidationCollector, TypirServices, ValidationCollector, ValidationProblem, ValidationRule, ValidationRulesForLanguageKeys } from 'typir';
import { TypirLangiumServices, TypirLangiumSpecifics } from '../typir-langium.js';

export function registerTypirValidationChecks<Specifics extends TypirLangiumSpecifics>(langiumServices: LangiumDefaultCoreServices, typirServices: TypirLangiumServices<Specifics>) {
    const registry = langiumServices.validation.ValidationRegistry;
    const validator = typirServices.validation.TypeValidation;
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
*/


/**
 * This service is a technical adapter service,
 * which helps to call the Typir validations, triggered by the Langium validation mechanisms.
 */
export interface LangiumTypirValidator<Specifics extends TypirLangiumSpecifics> {
    /**
     * Will be called once before starting the validation of a LangiumDocument.
     * @param rootNode the root node of the current document
     * @param accept receives the found validation issues
     */
    checkTypingProblemsWithTypirBeforeDocument(rootNode: Specifics['LanguageType'], accept: ValidationAcceptor): void;

    /**
     * Executes all checks, which are directly derived from the current Typir configuration,
     * i.e. checks that arguments fit to parameters for function calls (including operands for operators).
     * @param node the current AST node to check regarding typing issues
     * @param accept receives the found validation issues
     */
    checkTypingProblemsWithTypir(node: Specifics['LanguageType'], accept: ValidationAcceptor): void;

    /**
     * Will be called once after finishing the validation of a LangiumDocument.
     * @param rootNode the root node of the current document
     * @param accept receives the found validation issues
     */
    checkTypingProblemsWithTypirAfterDocument(rootNode: Specifics['LanguageType'], accept: ValidationAcceptor): void;
}

export class DefaultLangiumTypirValidator<Specifics extends TypirLangiumSpecifics> implements LangiumTypirValidator<Specifics> {
    protected readonly services: TypirServices<Specifics>;

    constructor(services: TypirLangiumServices<Specifics>) {
        this.services = services;
    }

    checkTypingProblemsWithTypirBeforeDocument(rootNode: Specifics['LanguageType'], accept: ValidationAcceptor): void {
        this.report(this.services.validation.Collector.validateBefore(rootNode), rootNode, accept);
    }

    checkTypingProblemsWithTypir(node: Specifics['LanguageType'], accept: ValidationAcceptor) {
        this.report(this.services.validation.Collector.validate(node), node, accept);
    }

    checkTypingProblemsWithTypirAfterDocument(rootNode: Specifics['LanguageType'], accept: ValidationAcceptor): void {
        this.report(this.services.validation.Collector.validateAfter(rootNode), rootNode, accept);
    }

    protected report(problems: Array<ValidationProblem<Specifics>>, node: Specifics['LanguageType'], accept: ValidationAcceptor): void {
        // print all found problems for the given AST node
        for (const problem of problems) {
            const message = this.services.Printer.printValidationProblem(problem); // includes the subProblems into the message
            accept(problem.severity, message, {
                // these properties are named differently in Langium and Typir:
                node: problem.languageNode,
                property: problem.languageProperty as (Properties<Specifics['LanguageType']> | undefined),
                index: problem.languageIndex,
                // copy all other DiagnosticInfo properties:
                ...problem,
            });
        }
    }
}


/**
 * Taken and adapted from 'ValidationChecks' from 'langium'.
 *
 * A utility type for associating non-primitive AST types to corresponding validation rules. For example:
 *
 * ```typescript
 *   addValidationRulesForLanguageNodes({
 *      VariableDeclaration: (node, typir) => { return [...]; },
 *      Another$typeName: (node, typir) => ...,
 *      // ...
 *      AstNode: (node, typir) => ..., // executed for all AstNodes
 *   });
 * ```
 *
 * In contrast to Typir (core), Typir-Langium enables to register validation rules to `AstNode` as well.
 */
export type LangiumValidationRules<Specifics extends TypirLangiumSpecifics> = ValidationRulesForLanguageKeys<Specifics> & {
    // TODO nodes inside ValidationRules are typed by the TypeScript compiler as `any` not as `AstNode`
    AstNode?: ValidationRule<Specifics, Specifics['LanguageType']> | Array<ValidationRule<Specifics, Specifics['LanguageType']>>;
}


export interface LangiumValidationCollector<Specifics extends TypirLangiumSpecifics> extends ValidationCollector<Specifics> {
    addValidationRulesForLanguageNodes(rules: LangiumValidationRules<Specifics>): void;
}

export class DefaultLangiumValidationCollector<Specifics extends TypirLangiumSpecifics> extends DefaultValidationCollector<Specifics> implements LangiumValidationCollector<Specifics> {

    override addValidationRulesForLanguageNodes(rules: LangiumValidationRules<Specifics>): void {
        // map this approach for registering validation rules to the key-value approach from core Typir
        for (const [$type, validationRules] of Object.entries(rules)) {
            const languageKey = $type === 'AstNode' ? undefined : $type; // using 'AstNode' as key is equivalent to specifying no key: the rule is applied to all AstNodes
            const callbacks = validationRules as ValidationRule<Specifics> | Array<ValidationRule<Specifics>>;
            if (Array.isArray(callbacks)) {
                for (const callback of callbacks) {
                    this.addValidationRule(callback, { languageKey });
                }
            } else {
                this.addValidationRule(callbacks, { languageKey });
            }
        }
    }

}
