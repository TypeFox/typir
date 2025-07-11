/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { beforeEach, describe, expect, test } from 'vitest';
import { Type } from '../../../src/graph/type-node.js';
import { CustomKind } from '../../../src/kinds/custom/custom-kind.js';
import { CustomType, isCustomType } from '../../../src/kinds/custom/custom-type.js';
import { PrimitiveType } from '../../../src/kinds/primitive/primitive-type.js';
import { InferenceRuleNotApplicable } from '../../../src/services/inference.js';
import { IntegerLiteral, TestExpressionNode, TestLanguageNode } from '../../../src/test/predefined-language-nodes.js';
import { TypirServices } from '../../../src/typir.js';
import { createTypirServicesForTesting, expectToBeType } from '../../../src/utils/test-utils.js';

/**
 * The custom type called "RestrictedInteger" represents a primitive integer type with an upper bound,
 * i.e. it looks like usual integers, but integer values/literals higher than the upper bound cannot be assigned to the restricted integer.
 *
 * This TypeScript type specifies the properties of the Typir types which represent "restricted integers".
 */
export type RestrictedInteger = {
    upperBound: number;
};

describe('Tests inference and assignability for Integers with an upper bound', () => {
    let typir: TypirServices<TestLanguageNode>;
    let integerType: PrimitiveType;
    let customKind: CustomKind<RestrictedInteger, TestLanguageNode>;

    beforeEach(() => {
        typir = createTypirServicesForTesting();

        integerType = typir.factory.Primitives.create({ primitiveName: 'Integer' }).finish();

        customKind = new CustomKind<RestrictedInteger, TestLanguageNode>(typir, {
            name: 'RestrictedInteger',
            // determine which identifier is used to store and retrieve a custom type in the type graph
            // (and to check its uniqueness, i.e. if two types have the same identifier, they are the same and only one of it will be added to the type graph)
            calculateTypeIdentifier: properties => `custom-restricted-integer-${properties.upperBound}`,
            calculateTypeName: properties => `RI-${properties.upperBound}`, // the name for each RestrictedInteger type
            // each RestrictedIntegerType is an IntegerType!
            getSuperTypesOfNewCustomType: (_subNewCustom) => [integerType],
            // For conversion of RestrictedIntegers, both directions need to be specified, since:
            // - conversion is a directed relationship
            // - this RestrictedInteger might be converted to another RestrictedIntger, or another RestrictedInteger might be converted to this RestrictedInteger => these are two (slightly) different cases
            isNewCustomTypeConvertibleToType: (fromNewCustom, toOther) => isCustomType(toOther, fromNewCustom.kind) && fromNewCustom.properties.upperBound < toOther.properties.upperBound ? 'IMPLICIT_EXPLICIT' : 'NONE',
            isTypeConvertibleToNewCustomType: (fromOther, toNewCustom) => isCustomType(fromOther, toNewCustom.kind) && fromOther.properties.upperBound < toNewCustom.properties.upperBound ? 'IMPLICIT_EXPLICIT' : 'NONE',
        });

        typir.Inference.addInferenceRule(node => {
            if (node instanceof IntegerLiteral) {
                return integerType;
            }
            if (node instanceof RestrictedIntegerLiteral) {
                return restrictedType(node.upperBound); // creates (or gets) a corresponding RestrictedInteger type
            }
            return InferenceRuleNotApplicable;
        });
    });

    /**
     * Utility function to create a new restricted type in the Typir type system.
     * @param upperBound the desired upper bound
     * @returns the restricted type which is part of the type system in the current Typir instance/services
     */
    function restrictedType(upperBound: number): CustomType<RestrictedInteger, TestLanguageNode> {
        return customKind.create({ properties: { upperBound } }).finish().getTypeFinal()!;
    }

    test('Check type inference', () => {
        expectToBeType(typir.Inference.inferType(int2Limit10), result => isCustomType(result, customKind), result => result.properties.upperBound === 10);
        expectToBeType(typir.Inference.inferType(int6Limit10), result => isCustomType(result, customKind), result => result.properties.upperBound === 10);
        expect(typir.Inference.inferType(int2Limit10)).toBe(typir.Inference.inferType(int6Limit10)); // same type, as the upper bound is the same
    });


    function expectAssignability(sourceType: Type, targetType: Type): void {
        expect(typir.Assignability.isAssignable(sourceType, targetType)).toBe(true);
    }
    function expectAssignabilityProblem(sourceType: Type, targetType: Type, message: string): void {
        const result = typir.Assignability.getAssignabilityProblem(sourceType, targetType);
        expect(result).toBeTruthy();
        const resultPrinted = typir.Printer.printTypirProblem(result!);
        expect(resultPrinted).includes(message);
    }

    test('Assignability: same restricted types (2)', () => {
        expectAssignability(restrictedType(2), restrictedType(2));
    });
    test('Assignability: same restricted types (3)', () => {
        expectAssignability(restrictedType(3), restrictedType(3));
    });
    test('Assignability: same restricted types (10)', () => {
        expectAssignability(restrictedType(10), restrictedType(10));
    });

    test('Assignability 2 --> 3: works', () => {
        const r2 = restrictedType(2);
        const r3 = restrictedType(3);
        expectAssignability(r2, r3);
    });
    test('Assignability 2 --> 3: works (different order of type creation)', () => {
        const r3 = restrictedType(3);
        const r2 = restrictedType(2);
        expectAssignability(r2, r3);
    });

    test('Assignability 3 --> 2: not supported', () => {
        const r3 = restrictedType(3);
        const r2 = restrictedType(2);
        expectAssignabilityProblem(r3, r2, "The type 'RI-3' is not assignable to the type 'RI-2'.");
    });
    test('Assignability 3 --> 2: not supported (different order of type creation)', () => {
        const r2 = restrictedType(2);
        const r3 = restrictedType(3);
        expectAssignabilityProblem(r3, r2, "The type 'RI-3' is not assignable to the type 'RI-2'.");
    });

    test('Assignability 3 --> any integer: works', () => {
        expectAssignability(restrictedType(3), integerType);
    });

    test('Assignability any integer --> 3: not supported', () => {
        expectAssignabilityProblem(integerType, restrictedType(3), "The type 'Integer' is not assignable to the type 'RI-3'.");
    });

});


/**
 * Instances of this class represent literals of restricted integers in the AST, i.e. AST nodes.
 * In other words, RestrictedIntegerLiteral is for restricted integers, what IntegerLiteral (see predefined-language-nodes.ts) is for integers.
 *
 * While literals dedicated for restricted integers usually not occur in practical applications (only IntegerLiterals usually occur),
 * they are used here for demonstration and to make test cases shorter.
 */
class RestrictedIntegerLiteral extends TestExpressionNode {
    constructor(
        public value: number,
        public upperBound: number,
    ) { super(); }
}

// some predefined literals for restricted integers to be reused in test cases
const int2Limit10 = new RestrictedIntegerLiteral(2, 10);
const int6Limit10 = new RestrictedIntegerLiteral(6, 10);
