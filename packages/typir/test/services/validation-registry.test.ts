/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
******************************************************************************/

import { beforeEach, describe, expect, test } from 'vitest';
import { Type } from '../../src/graph/type-node.js';
import { PrimitiveType } from '../../src/kinds/primitive/primitive-type.js';
import { DefaultValidationCollector, ValidationRule, ValidationRuleOptions, ValidationRuleFunctional, ValidationRuleLifecycle } from '../../src/services/validation.js';
import { booleanTrue, integer123, IntegerLiteral, stringHello, StringLiteral, TestLanguageNode } from '../../src/test/predefined-language-nodes.js';
import { TypirServices } from '../../src/typir.js';
import { RuleRegistry } from '../../src/utils/rule-registration.js';
import { createTypirServicesForTesting, expectValidationIssues } from '../../src/utils/test-utils.js';

describe('Tests the logic for registering rules (applied to state-less validation rules)', () => {
    let typir: TypirServices<TestLanguageNode>;
    let integerType: PrimitiveType;
    let stringType: PrimitiveType;
    let ruleString: ValidationRuleFunctional<TestLanguageNode>;
    let ruleInteger: ValidationRuleFunctional<TestLanguageNode>;
    let ruleStringInteger: ValidationRuleFunctional<TestLanguageNode>;

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
            expectValidationIssues(typir, stringHello, ['s1-Hello']);
            expectValidationIssues(typir, integer123, []); // integer values are ignored by the rule for strings
            expectValidationIssues(typir, booleanTrue, []);
        });

        test('String rule registered for String', () => {
            addValidationRule(ruleString, { languageKey: StringLiteral.name });
            expectValidationIssues(typir, stringHello, ['s1-Hello']);
            expectValidationIssues(typir, integer123, []); // integer values are ignored by the rule for strings
            expectValidationIssues(typir, booleanTrue, []);
        });

        test('String rule registered for Integer => no validation issues', () => {
            addValidationRule(ruleString, { languageKey: IntegerLiteral.name });
            expectValidationIssues(typir, stringHello, []);
            expectValidationIssues(typir, integer123, []); // integer values are ignored by the rule for strings
            expectValidationIssues(typir, booleanTrue, []);
        });

        test('String+Integer rule without any options', () => {
            addValidationRule(ruleStringInteger, {});
            expectValidationIssues(typir, stringHello, ['s3-Hello']);
            expectValidationIssues(typir, integer123, ['i3-123']);
            expectValidationIssues(typir, booleanTrue, ['failure3-BooleanLiteral']); // generic message for everything else than strings and integers
        });

        test('String+Integer rule registered for String', () => {
            addValidationRule(ruleStringInteger, { languageKey: StringLiteral.name });
            expectValidationIssues(typir, stringHello, ['s3-Hello']);
            expectValidationIssues(typir, integer123, []); // no messages for not-evaluated validations
            expectValidationIssues(typir, booleanTrue, []);
        });
        test('String+Integer rule registered for Integer', () => {
            addValidationRule(ruleStringInteger, { languageKey: IntegerLiteral.name });
            expectValidationIssues(typir, stringHello, []);
            expectValidationIssues(typir, integer123, ['i3-123']);
            expectValidationIssues(typir, booleanTrue, []);
        });
        test('String+Integer rule registered for String and Integer', () => {
            addValidationRule(ruleStringInteger, { languageKey: [StringLiteral.name, IntegerLiteral.name] });
            expectValidationIssues(typir, stringHello, ['s3-Hello']);
            expectValidationIssues(typir, integer123, ['i3-123']);
            expectValidationIssues(typir, booleanTrue, []);
        });

        test('String rule + Integer rule without any options', () => {
            addValidationRule(ruleString, { });
            addValidationRule(ruleInteger, { });
            expectValidationIssues(typir, stringHello, ['s1-Hello']);
            expectValidationIssues(typir, integer123, ['i2-123']);
            expectValidationIssues(typir, booleanTrue, []);
        });
        test('String rule + Integer registered for their respective language keys', () => {
            addValidationRule(ruleString, { languageKey: StringLiteral.name });
            addValidationRule(ruleInteger, { languageKey: IntegerLiteral.name });
            expectValidationIssues(typir, stringHello, ['s1-Hello']);
            expectValidationIssues(typir, integer123, ['i2-123']);
            expectValidationIssues(typir, booleanTrue, []);
        });

        test('String rule + Integer + String+Integer rule without any options', () => {
            addValidationRule(ruleString, { });
            addValidationRule(ruleInteger, { });
            addValidationRule(ruleStringInteger, { });
            assertNumberRules(3);
            expectValidationIssues(typir, stringHello, ['s1-Hello', 's3-Hello']);
            expectValidationIssues(typir, integer123, ['i2-123', 'i3-123']);
            expectValidationIssues(typir, booleanTrue, ['failure3-BooleanLiteral']);
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
            expectValidationIssues(typir, stringHello, ['s3-Hello']);
            expectValidationIssues(typir, integer123, []);
            addValidationRule(ruleStringInteger, { languageKey: undefined });
            assertNumberRules(1);
            expectValidationIssues(typir, stringHello, ['s3-Hello']);
            expectValidationIssues(typir, integer123, ['i3-123']);
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
            expectValidationIssues(typir, stringHello, ['s3-Hello']);
            expectValidationIssues(typir, integer123, ['i3-123']);
            expectValidationIssues(typir, booleanTrue, []);
        });
    });

    describe('Remove validation rules with different language keys', () => {

        test('Removing a rule', () => {
            expectValidationIssues(typir, stringHello, []);
            addValidationRule(ruleString, { languageKey: StringLiteral.name });
            expectValidationIssues(typir, stringHello, ['s1-Hello']);
            removeValidationRule(ruleString, { languageKey: StringLiteral.name });
            expectValidationIssues(typir, stringHello, []);
        });
        test('Removing a rule (which was added twice)', () => {
            expectValidationIssues(typir, stringHello, []);
            addValidationRule(ruleString, { languageKey: StringLiteral.name });
            addValidationRule(ruleString, { languageKey: StringLiteral.name });
            expectValidationIssues(typir, stringHello, ['s1-Hello']);
            removeValidationRule(ruleString, { languageKey: StringLiteral.name });
            expectValidationIssues(typir, stringHello, []);
        });

        test('Removing a rule more often that it was added is OK', () => {
            removeValidationRule(ruleString, { languageKey: StringLiteral.name });
            expectValidationIssues(typir, stringHello, []);
            addValidationRule(ruleString, { languageKey: StringLiteral.name });
            expectValidationIssues(typir, stringHello, ['s1-Hello']);
            removeValidationRule(ruleString, { languageKey: StringLiteral.name });
            expectValidationIssues(typir, stringHello, []);
            removeValidationRule(ruleString, { languageKey: StringLiteral.name });
        });

        test('Remove the same rule for dedicated language keys and "undefined"', () => {
            addValidationRule(ruleStringInteger, { languageKey: undefined });
            removeValidationRule(ruleStringInteger, { languageKey: StringLiteral.name });
            assertNumberRules(1);
            expectValidationIssues(typir, stringHello, ['s3-Hello']); // it is still validated, since the rule is still registed for 'undefined'
            expectValidationIssues(typir, integer123, ['i3-123']);
        });

        test('Remove the same rule for dedicated language keys and "undefined"', () => {
            addValidationRule(ruleStringInteger, { languageKey: StringLiteral.name });
            assertNumberRules(1);
            expectValidationIssues(typir, stringHello, ['s3-Hello']);
            expectValidationIssues(typir, integer123, []);
            removeValidationRule(ruleStringInteger, { languageKey: undefined }); // the rule is removed for all language keys
            assertNumberRules(0);
            expectValidationIssues(typir, stringHello, []);
            expectValidationIssues(typir, integer123, []);
        });
    });


    describe('bound to type', () => {

        test('remove bound rule automatically ("undefined" as language key)', () => {
            addValidationRule(ruleStringInteger, { boundToType: stringType });
            assertNumberRules(1);
            expectValidationIssues(typir, stringHello, ['s3-Hello']);
            expectValidationIssues(typir, integer123, ['i3-123']);
            removeType(stringType);
            assertNumberRules(0);
            expectValidationIssues(typir, stringHello, []);
            expectValidationIssues(typir, integer123, []);
        });

        test('remove bound rule automatically (one dedicated language key: String)', () => {
            addValidationRule(ruleStringInteger, { boundToType: stringType, languageKey: [StringLiteral.name] });
            assertNumberRules(1);
            expectValidationIssues(typir, stringHello, ['s3-Hello']);
            expectValidationIssues(typir, integer123, []);
            removeType(stringType);
            assertNumberRules(0);
            expectValidationIssues(typir, stringHello, []);
            expectValidationIssues(typir, integer123, []);
        });

        test('remove bound rule automatically (one dedicated language key: Integer)', () => {
            addValidationRule(ruleStringInteger, { boundToType: stringType, languageKey: [IntegerLiteral.name] });
            assertNumberRules(1);
            expectValidationIssues(typir, stringHello, []);
            expectValidationIssues(typir, integer123, ['i3-123']);
            removeType(stringType);
            assertNumberRules(0);
            expectValidationIssues(typir, stringHello, []);
            expectValidationIssues(typir, integer123, []);
        });

        test('remove bound rule automatically (multiple dedicated language keys)', () => {
            addValidationRule(ruleStringInteger, { boundToType: stringType, languageKey: [StringLiteral.name, IntegerLiteral.name] });
            assertNumberRules(1);
            expectValidationIssues(typir, stringHello, ['s3-Hello']);
            expectValidationIssues(typir, integer123, ['i3-123']);
            assertNumberRules(1);
            removeType(stringType); // rule is removed for all language keys!
            assertNumberRules(0);
            expectValidationIssues(typir, stringHello, []);
            expectValidationIssues(typir, integer123, []);
        });

        test('remove bound rule automatically, when the last type is removed', () => {
            addValidationRule(ruleStringInteger, { boundToType: [stringType, integerType] });
            assertNumberRules(1);
            expectValidationIssues(typir, stringHello, ['s3-Hello']);
            expectValidationIssues(typir, integer123, ['i3-123']);
            removeType(stringType);
            assertNumberRules(1);
            expectValidationIssues(typir, stringHello, ['s3-Hello']);
            expectValidationIssues(typir, integer123, ['i3-123']);
            removeType(integerType);
            assertNumberRules(0);
            expectValidationIssues(typir, stringHello, []);
            expectValidationIssues(typir, integer123, []);
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
        const registry = (typir.validation.Collector as TestValidatorImpl).ruleRegistryFunctional;
        expect(registry.getNumberUniqueRules()).toBe(size);
    }
});

class TestValidatorImpl extends DefaultValidationCollector<TestLanguageNode> {
    // make the public to access their details
    override readonly ruleRegistryFunctional: RuleRegistry<ValidationRuleFunctional<TestLanguageNode>, TestLanguageNode>;
    override readonly ruleRegistryLifecycle: RuleRegistry<ValidationRuleLifecycle<TestLanguageNode>, TestLanguageNode>;
}
