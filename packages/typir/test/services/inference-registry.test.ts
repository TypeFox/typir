/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
******************************************************************************/

import { beforeEach, describe, expect, test } from 'vitest';
import { isType, Type } from '../../src/graph/type-node.js';
import { PrimitiveType } from '../../src/kinds/primitive/primitive-type.js';
import { CompositeTypeInferenceRule, DefaultTypeInferenceCollector, InferenceProblem, InferenceRuleNotApplicable, TypeInferenceRule, TypeInferenceRuleWithoutInferringChildren } from '../../src/services/inference.js';
import { ValidationRuleOptions } from '../../src/services/validation.js';
import { booleanFalse, createTypirServicesForTesting, integer123, IntegerLiteral, stringHello, StringLiteral, TestingSpecifics, TestLanguageNode } from '../../src/test/predefined-language-nodes.js';
import { TypirServices } from '../../src/typir.js';
import { RuleRegistry } from '../../src/utils/rule-registration.js';

describe('Tests the logic for registering rules (applied to inference rules)', () => {
    let typir: TypirServices<TestingSpecifics>;
    let integerType: PrimitiveType;
    let stringType: PrimitiveType;
    let composite: CompositeTypeInferenceRule<TestingSpecifics>;
    let ruleString: TypeInferenceRuleWithoutInferringChildren<TestingSpecifics>;
    let ruleInteger: TypeInferenceRuleWithoutInferringChildren<TestingSpecifics>;
    let ruleStringInteger: TypeInferenceRuleWithoutInferringChildren<TestingSpecifics>;
    const NOT_FOUND = 'found no applicable inference rules';

    beforeEach(() => {
        // Typir services
        typir = createTypirServicesForTesting({
            Inference: (services) => new TestInferenceImpl(services),
        });

        // primitive types
        integerType = typir.factory.Primitives.create({ primitiveName: 'integer' }).finish();
        stringType = typir.factory.Primitives.create({ primitiveName: 'string' }).finish();

        // composite inference rules
        composite = new CompositeTypeInferenceRule(typir, typir.Inference);

        // validation rules
        ruleString = node => {
            if (node instanceof StringLiteral) {
                return stringType;
            } else {
                return InferenceRuleNotApplicable;
            }
        };
        ruleInteger = node => {
            if (node instanceof IntegerLiteral) {
                return integerType;
            } else {
                return InferenceRuleNotApplicable;
            }
        };
        ruleStringInteger = node => {
            if (node instanceof StringLiteral) {
                return stringType;
            } else if (node instanceof IntegerLiteral) {
                return integerType;
            } else {
                return {
                    $problem: InferenceProblem,
                    languageNode: node,
                    location: 'failure3-' + node.print(),
                    subProblems: [],
                };
            }
        };
    });


    describe('Simple inference rules', () => {

        test('add String rule without any options', () => {
            assertNumberRules(0);
            addInferenceRule(ruleString);
            assertNumberRules(1);
            infer(stringHello, stringType);
        });

        test('remove String rule without any options', () => {
            addInferenceRule(ruleString);
            infer(stringHello, stringType);
            removeInferenceRule(ruleString);
            assertNumberRules(0);
            infer(stringHello, NOT_FOUND);
        });

        test('add rule for Strings only', () => {
            addInferenceRule(ruleStringInteger, { languageKey: StringLiteral.name });
            infer(stringHello, stringType);
            infer(integer123, NOT_FOUND);
            infer(booleanFalse, NOT_FOUND);
        });

        test('add rule for String and Integer', () => {
            addInferenceRule(ruleStringInteger, { languageKey: StringLiteral.name });
            infer(stringHello, stringType);
            infer(integer123, NOT_FOUND);
            infer(booleanFalse, NOT_FOUND);
            addInferenceRule(ruleStringInteger, { languageKey: IntegerLiteral.name });
            infer(stringHello, stringType);
            infer(integer123, integerType);
            infer(booleanFalse, NOT_FOUND);
        });

        test('remove rule', () => {
            addInferenceRule(ruleStringInteger, { languageKey: [StringLiteral.name, IntegerLiteral.name] });
            infer(stringHello, stringType);
            infer(integer123, integerType);
            infer(booleanFalse, NOT_FOUND);
            removeInferenceRule(ruleStringInteger, { languageKey: IntegerLiteral.name });
            infer(stringHello, stringType);
            infer(integer123, NOT_FOUND);
            infer(booleanFalse, NOT_FOUND);
            removeInferenceRule(ruleStringInteger, { languageKey: StringLiteral.name });
            infer(stringHello, NOT_FOUND);
            infer(integer123, NOT_FOUND);
            infer(booleanFalse, NOT_FOUND);
        });

    });

    describe('Composite inference rule', () => {

        test('add String rule to composite', () => {
            assertNumberRules(0);
            composite.addInferenceRule(ruleString);
            assertNumberRules(1);
            infer(stringHello, stringType);
        });

        test('remove String rule from composite', () => {
            composite.addInferenceRule(ruleString);
            infer(stringHello, stringType);
            composite.removeInferenceRule(ruleString);
            assertNumberRules(0);
            infer(stringHello, NOT_FOUND);
        });

        test('remove multiple rules from composite (with "undefined" as language key)', () => {
            composite.addInferenceRule(ruleString);
            composite.addInferenceRule(ruleInteger);
            assertNumberRules(1);
            infer(stringHello, stringType);
            infer(integer123, integerType);
            composite.removeInferenceRule(ruleString);
            assertNumberRules(1);
            infer(stringHello, NOT_FOUND);
            infer(integer123, integerType);
            composite.removeInferenceRule(ruleInteger);
            assertNumberRules(0);
            infer(stringHello, NOT_FOUND);
            infer(integer123, NOT_FOUND);
        });

        test('remove rule with multiple keys from composite', () => {
            composite.addInferenceRule(ruleStringInteger, { languageKey: [StringLiteral.name, IntegerLiteral.name] });
            assertNumberRules(1);
            infer(stringHello, stringType);
            infer(integer123, integerType);
            composite.removeInferenceRule(ruleStringInteger, { languageKey: StringLiteral.name });
            assertNumberRules(1);
            infer(stringHello, NOT_FOUND);
            infer(integer123, integerType);
            composite.removeInferenceRule(ruleStringInteger, { languageKey: IntegerLiteral.name });
            assertNumberRules(0);
            infer(stringHello, NOT_FOUND);
            infer(integer123, NOT_FOUND);
        });

        test('remove rules which are bound to types from composite', () => {
            assertNumberRules(0);
            composite.addInferenceRule(ruleString, { boundToType: stringType });
            assertNumberRules(1);
            infer(stringHello, stringType);
            infer(integer123, NOT_FOUND);
            composite.addInferenceRule(ruleInteger, { boundToType: integerType });
            assertNumberRules(1);
            infer(stringHello, stringType);
            infer(integer123, integerType);
            removeType(stringType);
            assertNumberRules(1);
            infer(stringHello, NOT_FOUND);
            infer(integer123, integerType);
            removeType(integerType);
            assertNumberRules(0);
            infer(stringHello, NOT_FOUND);
            infer(integer123, NOT_FOUND);
        });

        test('remove rule which is bound to types from composite', () => {
            assertNumberRules(0);
            composite.addInferenceRule(ruleStringInteger, { boundToType: [stringType, integerType] });
            assertNumberRules(1);
            infer(stringHello, stringType);
            infer(integer123, integerType);
            removeType(stringType);
            assertNumberRules(1);
            infer(stringHello, stringType); // important to note: the String type is removed from the type system, but the hard-coded logic of the inference rule still uses it!
            infer(integer123, integerType);
            removeType(integerType); // the composite rule is removed, after the last bound type is deleted
            assertNumberRules(0);
            infer(stringHello, NOT_FOUND);
            infer(integer123, NOT_FOUND);
        });

    });


    function removeType(type: Type): void {
        typir.infrastructure.Graph.removeNode(type);
    }
    function addInferenceRule(rule: TypeInferenceRuleWithoutInferringChildren<TestingSpecifics>, options?: Partial<ValidationRuleOptions<TestingSpecifics>>) {
        typir.Inference.addInferenceRule(rule, options);
    }
    function removeInferenceRule(rule: TypeInferenceRuleWithoutInferringChildren<TestingSpecifics>, options?: Partial<ValidationRuleOptions<TestingSpecifics>>) {
        typir.Inference.removeInferenceRule(rule, options);
    }

    function assertNumberRules(size: number): void {
        const registry = (typir.Inference as TestInferenceImpl).ruleRegistry;
        expect(registry.getNumberUniqueRules()).toBe(size);
    }

    function infer(node: TestLanguageNode, expected: Type | string): void {
        const actual = typir.Inference.inferType(node);
        if (isType(actual)) {
            if (isType(expected)) {
                const equal = typir.Equality.getTypeEqualityProblem(actual, expected);
                if (equal === undefined) {
                    // that is fine
                } else {
                    expect.fail(typir.Printer.printTypirProblem(equal));
                }
            } else {
                expect.fail(`Got type '${actual.getName()}', but expected error "${expected}"`);
            }
        } else {
            const actualProblems = actual.map(a => typir.Printer.printTypirProblem(a)).join('\n');
            if (isType(expected)) {
                expect.fail(`Got error "${actualProblems}", but expected type '${expected.getName()}'.`);
            } else {
                expect(actualProblems.includes(expected), actualProblems).toBeTruthy();
            }
        }
    }
});

class TestInferenceImpl extends DefaultTypeInferenceCollector<TestingSpecifics> {
    // change its visibility to public to access their details
    override readonly ruleRegistry: RuleRegistry<TypeInferenceRule<TestingSpecifics>, TestingSpecifics>;
}
