/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { AstNode, LangiumDefaultCoreServices, ValidationAcceptor, ValidationChecks } from 'langium';
import { DefaultValidationCollector, TypirServices, ValidationCollector, ValidationProblem, ValidationRule } from 'typir';
import { LangiumServicesForTypirBinding } from '../typir-langium.js';
import { LangiumAstTypes } from '../utils/typir-langium-utils.js';

export function registerTypirValidationChecks(langiumServices: LangiumDefaultCoreServices, typirServices: LangiumServicesForTypirBinding) {
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
*
* Improved Validation API for Langium:
* - const ref: (kind: unknown) => kind is FunctionKind = isFunctionKind; // use this signature for Langium?
* - [<VariableDeclaration>{ selector: isVariableDeclaration, result: languageNode => languageNode.type }, <BinaryExpression>{}]      Array<InferenceRule<T>>
* Apply the same ideas for InferenceRules as well!
*/


/**
 * This service is a technical adapter service,
 * which helps to call the Typir validations, triggered by the Langium validation mechanisms.
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
    protected readonly services: TypirServices<AstNode>;

    constructor(services: LangiumServicesForTypirBinding) {
        this.services = services;
    }

    checkTypingProblemsWithTypirBeforeDocument(rootNode: AstNode, accept: ValidationAcceptor): void {
        this.report(this.services.validation.Collector.validateBefore(rootNode), rootNode, accept);
    }

    checkTypingProblemsWithTypir(node: AstNode, accept: ValidationAcceptor) {
        this.report(this.services.validation.Collector.validate(node), node, accept);
    }

    checkTypingProblemsWithTypirAfterDocument(rootNode: AstNode, accept: ValidationAcceptor): void {
        this.report(this.services.validation.Collector.validateAfter(rootNode), rootNode, accept);
    }

    protected report(problems: Array<ValidationProblem<AstNode>>, node: AstNode, accept: ValidationAcceptor): void {
        // print all found problems for the given AST node
        for (const problem of problems) {
            const message = this.services.Printer.printValidationProblem(problem);
            accept(problem.severity, message, { node, property: problem.languageProperty, index: problem.languageIndex });
        }
    }
}


/**
 * Taken and adapted from 'ValidationChecks' from 'langium'.
 *
 * A utility type for associating non-primitive AST types to corresponding validation rules. For example:
 *
 * ```ts
 *   addValidationsRulesForAstNodes<LoxAstType>({
 *      VariableDeclaration: (node, typir) => { return [...]; },
 *   });
 * ```
 *
 * @param T a type definition mapping language specific type names (keys) to the corresponding types (values)
 */
export type LangiumValidationRules<T extends LangiumAstTypes> = {
    [K in keyof T]?: T[K] extends AstNode ? ValidationRule<AstNode, T[K]> | Array<ValidationRule<AstNode, T[K]>> : never
} & {
    AstNode?: ValidationRule<AstNode> | Array<ValidationRule<AstNode>>;
}


export interface LangiumValidationCollector extends ValidationCollector<AstNode> {
    addValidationRulesForAstNodes<AstTypes extends LangiumAstTypes>(rules: LangiumValidationRules<AstTypes>): void;
}

export class DefaultLangiumValidationCollector extends DefaultValidationCollector<AstNode> implements LangiumValidationCollector {

    addValidationRulesForAstNodes<AstTypes extends LangiumAstTypes>(rules: LangiumValidationRules<AstTypes>): void {
        // map this approach for registering validation rules to the key-value approach from core Typir
        for (const [type, ruleCallbacks] of Object.entries(rules)) {
            const languageKey = type === 'AstNode' ? undefined : type; // using 'AstNode' as key is equivalent to specifying no key
            const callbacks = ruleCallbacks as ValidationRule<AstNode> | Array<ValidationRule<AstNode>>;
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
