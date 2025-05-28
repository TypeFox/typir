/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { beforeEach, describe, expect, test } from "vitest";
import {
    createTypirServicesForTesting,
    expectTypirTypes,
} from "../../../src/utils/test-utils.js";
import { assertTypirType } from "../../../src/utils/utils.js";
import { isPrimitiveType } from "../../../src/kinds/primitive/primitive-type.js";
import {
    integer123,
    IntegerLiteral,
    stringHello,
    StringLiteral,
    TestLanguageNode,
} from "../../../src/test/predefined-language-nodes.js";
import { TypirServices } from "../../../src/typir.js";

describe("Tests some details for primitive types", () => {
    test("create primitive and get it by name", () => {
        const typir = createTypirServicesForTesting();
        const integerType1 = typir.factory.Primitives.create({
            primitiveName: "integer",
        }).finish();
        assertTypirType(integerType1, isPrimitiveType, "integer");
        expectTypirTypes(typir, isPrimitiveType, "integer");
        const integerType2 = typir.factory.Primitives.get({
            primitiveName: "integer",
        });
        assertTypirType(integerType2, isPrimitiveType, "integer");
        expect(integerType1).toBe(integerType2);
    });

    test("error when trying to create the same primitive twice", () => {
        const typir = createTypirServicesForTesting();
        // create the 1st integer
        const integerType1 = typir.factory.Primitives.create({
            primitiveName: "integer",
        }).finish();
        assertTypirType(integerType1, isPrimitiveType, "integer");
        // creating the 2nd integer will fail
        expect(() =>
            typir.factory.Primitives.create({
                primitiveName: "integer",
            }).finish(),
        ).toThrowError();
    });

    describe("Test validation for inference rule of a primitive type", () => {
        let typir: TypirServices<TestLanguageNode>;

        beforeEach(() => {
            typir = createTypirServicesForTesting();
            // create a primitive type with some inference rules
            typir.factory.Primitives.create({ primitiveName: "integer" })
                .inferenceRule({
                    // 1st rule for IntegerLiterals, with validation
                    languageKey: IntegerLiteral.name,
                    validation: (node: IntegerLiteral, type, accept) =>
                        accept({
                            message: "integer-validation",
                            languageNode: node,
                            severity: "error",
                        }),
                })
                .inferenceRule({
                    // 2nd rule for StringLiterals (which does not make sense, just for testing), without validation
                    languageKey: StringLiteral.name,
                })
                .finish();
        });

        test("Integer value with validation issues", () => {
            assertTypirType(
                typir.Inference.inferType(integer123),
                isPrimitiveType,
                "integer",
            ); // test the successful inference
            const result = typir.validation.Collector.validate(integer123); // check that a validation issue is produced
            expect(result).toHaveLength(1);
            expect(result[0].message).toBe("integer-validation");
        });

        test("String value without validation issue", () => {
            assertTypirType(
                typir.Inference.inferType(stringHello),
                isPrimitiveType,
                "integer",
            ); // test the successful inference
            const result = typir.validation.Collector.validate(stringHello); // check that no validation issue is produced
            expect(result).toHaveLength(0);
        });
    });
});
