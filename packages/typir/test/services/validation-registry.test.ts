/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
******************************************************************************/

import { beforeEach, describe, expect, test } from 'vitest';
import { DefaultValidationCollector, PrimitiveType, RuleRegistry, Type, ValidationRule, ValidationRuleOptions, ValidationRuleStateless, ValidationRuleWithBeforeAfter } from '../../src/index.js';
import { booleanTrue, integer123, IntegerLiteral, stringHello, StringLiteral, TestLanguageNode } from '../../src/test/predefined-language-nodes.js';
import { TypirServices } from '../../src/typir.js';
import { createTypirServicesForTesting } from '../../src/utils/test-utils.js';

describe('Tests the logic for registering rules (applied to state-less validation rules)', () => {
    let typir: TypirServices<TestLanguageNode>;
    let integerType: PrimitiveType;
    let stringType: PrimitiveType;
    let ruleString: ValidationRuleStateless<TestLanguageNode>;
    let ruleInteger: ValidationRuleStateless<TestLanguageNode>;
    let ruleStringInteger: ValidationRuleStateless<TestLanguageNode>;

    beforeEach(() => {
        // Typir services
        typir = createTypirServicesForTesting({
            validation: {
                Collector: (services) => new TestValidatorImpl(services),
            }
        });

        // primitive types
        integerType = typir.factory.Primitives.create({ primitiveName: 'integer' }).inferenceRule({ filter: node => node instanceof IntegerLiteral }).finish();
        stringType = typir.factory.Primitives.create({ primitiveName: 'string' }).inferenceRule({ filter: node => node instanceof StringLiteral }).finish();

        // validation rules
        ruleString = (node, accept) => {
            if (node instanceof StringLiteral) {
                accept({ languageNode: node, severity: 'error', message: `s1-${node.value}` });
            }
        };
        ruleInteger = (node, accept) => {
            if (node instanceof IntegerLiteral) {
                accept({ languageNode: node, severity: 'error', message: `i2-${node.value}` });
            }
        };
        ruleStringInteger = (node, accept) => {
            if (node instanceof StringLiteral) {
                accept({ languageNode: node, severity: 'error', message: `s3-${node.value}` });
            } else if (node instanceof IntegerLiteral) {
                accept({ languageNode: node, severity: 'error', message: `i3-${node.value}` });
            } else {
                accept({ languageNode: node, severity: 'error', message: `failure3-${node.constructor.name}` });
            }
        };
    });

    describe('Add validation rules with different language keys', () => {
        test('String rule without any options', () => {
            addValidationRule(ruleString, {});
            validate(stringHello, 's1-Hello');
            validate(integer123); // integer values are ignored by the rule for strings
            validate(booleanTrue);
        });

        test('String rule registered for String', () => {
            addValidationRule(ruleString, { languageKey: StringLiteral.name });
            validate(stringHello, 's1-Hello');
            validate(integer123); // integer values are ignored by the rule for strings
            validate(booleanTrue);
        });

        test('String rule registered for Integer => no validation hints', () => {
            addValidationRule(ruleString, { languageKey: IntegerLiteral.name });
            validate(stringHello);
            validate(integer123); // integer values are ignored by the rule for strings
            validate(booleanTrue);
        });

        test('String+Integer rule without any options', () => {
            addValidationRule(ruleStringInteger, {});
            validate(stringHello, 's3-Hello');
            validate(integer123, 'i3-123');
            validate(booleanTrue, 'failure3-BooleanLiteral'); // generic message for everything else than strings and integers
        });

        test('String+Integer rule registered for String', () => {
            addValidationRule(ruleStringInteger, { languageKey: StringLiteral.name });
            validate(stringHello, 's3-Hello');
            validate(integer123); // no messages for not-evaluated validations
            validate(booleanTrue);
        });
        test('String+Integer rule registered for Integer', () => {
            addValidationRule(ruleStringInteger, { languageKey: IntegerLiteral.name });
            validate(stringHello);
            validate(integer123, 'i3-123');
            validate(booleanTrue);
        });
        test('String+Integer rule registered for String and Integer', () => {
            addValidationRule(ruleStringInteger, { languageKey: [StringLiteral.name, IntegerLiteral.name] });
            validate(stringHello, 's3-Hello');
            validate(integer123, 'i3-123');
            validate(booleanTrue);
        });

        test('String rule + Integer rule without any options', () => {
            addValidationRule(ruleString, { });
            addValidationRule(ruleInteger, { });
            validate(stringHello, 's1-Hello');
            validate(integer123, 'i2-123');
            validate(booleanTrue);
        });
        test('String rule + Integer registered for their respective language keys', () => {
            addValidationRule(ruleString, { languageKey: StringLiteral.name });
            addValidationRule(ruleInteger, { languageKey: IntegerLiteral.name });
            validate(stringHello, 's1-Hello');
            validate(integer123, 'i2-123');
            validate(booleanTrue);
        });

        test('String rule + Integer + String+Integer rule without any options', () => {
            addValidationRule(ruleString, { });
            addValidationRule(ruleInteger, { });
            addValidationRule(ruleStringInteger, { });
            assertNumberRules(3);
            validate(stringHello, 's1-Hello', 's3-Hello');
            validate(integer123, 'i2-123', 'i3-123');
            validate(booleanTrue, 'failure3-BooleanLiteral');
        });

        test('adding different rules', () => {
            assertNumberRules(0);
            addValidationRule(ruleString, { });
            assertNumberRules(1);
            addValidationRule(ruleInteger, { });
            assertNumberRules(2);
            addValidationRule(ruleStringInteger, { });
            assertNumberRules(3);
        });

        test('Add the same rule for dedicated language keys and "undefined"', () => {
            addValidationRule(ruleStringInteger, { languageKey: StringLiteral.name });
            validate(stringHello, 's3-Hello');
            validate(integer123);
            addValidationRule(ruleStringInteger, { languageKey: undefined });
            assertNumberRules(1);
            validate(stringHello, 's3-Hello');
            validate(integer123, 'i3-123');
        });

    });


    describe('Add the same rule multiple times', () => {
        test('adding the same rule multiple times', () => {
            assertNumberRules(0);
            addValidationRule(ruleString, { });
            assertNumberRules(1);
            addValidationRule(ruleString, { });
            assertNumberRules(1);
            addValidationRule(ruleString, { });
            assertNumberRules(1);
        });

        test('Adding the same rule for different language keys', () => {
            addValidationRule(ruleStringInteger, { languageKey: StringLiteral.name });
            assertNumberRules(1);
            addValidationRule(ruleStringInteger, { languageKey: IntegerLiteral.name });
            assertNumberRules(1);
            validate(stringHello, 's3-Hello');
            validate(integer123, 'i3-123');
            validate(booleanTrue);
        });
    });

    describe('Remove validation rules with different language keys', () => {

        test('Removing a rule', () => {
            validate(stringHello);
            addValidationRule(ruleString, { languageKey: StringLiteral.name });
            validate(stringHello, 's1-Hello');
            removeValidationRule(ruleString, { languageKey: StringLiteral.name });
            validate(stringHello);
        });
        test('Removing a rule (which was added twice)', () => {
            validate(stringHello);
            addValidationRule(ruleString, { languageKey: StringLiteral.name });
            addValidationRule(ruleString, { languageKey: StringLiteral.name });
            validate(stringHello, 's1-Hello');
            removeValidationRule(ruleString, { languageKey: StringLiteral.name });
            validate(stringHello);
        });

        test('Removing a rule more often that it was added is OK', () => {
            removeValidationRule(ruleString, { languageKey: StringLiteral.name });
            validate(stringHello);
            addValidationRule(ruleString, { languageKey: StringLiteral.name });
            validate(stringHello, 's1-Hello');
            removeValidationRule(ruleString, { languageKey: StringLiteral.name });
            validate(stringHello);
            removeValidationRule(ruleString, { languageKey: StringLiteral.name });
        });

        test('Remove the same rule for dedicated language keys and "undefined"', () => {
            addValidationRule(ruleStringInteger, { languageKey: undefined });
            removeValidationRule(ruleStringInteger, { languageKey: StringLiteral.name });
            assertNumberRules(1);
            validate(stringHello, 's3-Hello'); // it is still validated, since the rule is still registed for 'undefined'
            validate(integer123, 'i3-123');
        });

        test('Remove the same rule for dedicated language keys and "undefined"', () => {
            addValidationRule(ruleStringInteger, { languageKey: StringLiteral.name });
            assertNumberRules(1);
            validate(stringHello, 's3-Hello');
            validate(integer123);
            removeValidationRule(ruleStringInteger, { languageKey: undefined }); // the rule is removed for all language keys
            assertNumberRules(0);
            validate(stringHello);
            validate(integer123);
        });
    });


    describe('bound to type', () => {

        test('remove bound rule automatically ("undefined" as language key)', () => {
            addValidationRule(ruleStringInteger, { boundToType: stringType });
            assertNumberRules(1);
            validate(stringHello, 's3-Hello');
            validate(integer123, 'i3-123');
            removeType(stringType);
            assertNumberRules(0);
            validate(stringHello);
            validate(integer123);
        });

        test('remove bound rule automatically (one dedicated language key: String)', () => {
            addValidationRule(ruleStringInteger, { boundToType: stringType, languageKey: [StringLiteral.name] });
            assertNumberRules(1);
            validate(stringHello, 's3-Hello');
            validate(integer123);
            removeType(stringType);
            assertNumberRules(0);
            validate(stringHello);
            validate(integer123);
        });

        test('remove bound rule automatically (one dedicated language key: Integer)', () => {
            addValidationRule(ruleStringInteger, { boundToType: stringType, languageKey: [IntegerLiteral.name] });
            assertNumberRules(1);
            validate(stringHello);
            validate(integer123, 'i3-123');
            removeType(stringType);
            assertNumberRules(0);
            validate(stringHello);
            validate(integer123);
        });

        test('remove bound rule automatically (multiple dedicated language keys)', () => {
            addValidationRule(ruleStringInteger, { boundToType: stringType, languageKey: [StringLiteral.name, IntegerLiteral.name] });
            assertNumberRules(1);
            validate(stringHello, 's3-Hello');
            validate(integer123, 'i3-123');
            assertNumberRules(1);
            removeType(stringType); // rule is removed for all language keys!
            assertNumberRules(0);
            validate(stringHello);
            validate(integer123);
        });

        test('remove bound rule automatically, when the last type is removed', () => {
            addValidationRule(ruleStringInteger, { boundToType: [stringType, integerType] });
            assertNumberRules(1);
            validate(stringHello, 's3-Hello');
            validate(integer123, 'i3-123');
            removeType(stringType);
            assertNumberRules(1);
            validate(stringHello, 's3-Hello');
            validate(integer123, 'i3-123');
            removeType(integerType);
            assertNumberRules(0);
            validate(stringHello);
            validate(integer123);
        });
    });


    function removeType(type: Type): void {
        typir.infrastructure.Graph.removeNode(type);
    }
    function addValidationRule(rule: ValidationRule<TestLanguageNode>, options?: Partial<ValidationRuleOptions>) {
        typir.validation.Collector.addValidationRule(rule, options);
    }
    function removeValidationRule(rule: ValidationRule<TestLanguageNode>, options?: Partial<ValidationRuleOptions>) {
        typir.validation.Collector.removeValidationRule(rule, options);
    }

    function assertNumberRules(size: number): void {
        const registry = (typir.validation.Collector as TestValidatorImpl).ruleRegistryStateLess;
        expect(registry.getAllRules().size).toBe(size);
    }

    function validate(node: TestLanguageNode, ...messagesExpected: string[]): void {
        const messagesActual = typir.validation.Collector.validate(node).map(m => typir.Printer.printTypirProblem(m));
        let indexExpected = 0;
        while (indexExpected < messagesExpected.length) {
            let indexActual = 0;
            let found = false;
            while (indexActual < messagesActual.length) {
                if (messagesActual[indexActual].includes(messagesExpected[indexExpected])) {
                    // remove the found messages => not matching messages remain
                    found = true;
                    messagesExpected.splice(indexExpected, 1);
                    messagesActual.splice(indexActual, 1);
                    break;
                } else {
                    indexActual++;
                }
            }
            if (found) {
                // indexExpected was implicitly incremented
            } else {
                indexExpected++;
            }
        }

        const msgExpected = messagesExpected.join('\n').trim();
        const msgActual = messagesActual.join('\n').trim();
        if (messagesExpected.length >= 1 && messagesActual.length >= 1) {
            expect.fail(`Didn't found expected:\n${msgExpected}\nBut found some more:\n${msgActual}`);
        } else if (messagesExpected.length >= 1) {
            expect.fail(`Didn't found expected:\n${msgExpected}`);
        } else if (msgActual.length >= 1) {
            expect.fail(`Found some more:\n${msgActual}`);
        } else {
            // everything is fine!
        }
    }
});

class TestValidatorImpl extends DefaultValidationCollector<TestLanguageNode> {
    // make the public to access their details
    override readonly ruleRegistryStateLess: RuleRegistry<ValidationRuleStateless<TestLanguageNode>>;
    override readonly ruleRegistryBeforeAfter: RuleRegistry<ValidationRuleWithBeforeAfter<TestLanguageNode>>;
}
