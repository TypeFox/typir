/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { AstUtils } from "langium";
import { isClassType, isPrimitiveType } from "typir";
import { expectToBeType, expectTypirTypes } from "typir/test";
import { describe, expect, test } from "vitest";
import {
    isVariableDeclaration,
    LoxProgram,
} from "../src/language/generated/ast.js";
import { loxServices, validateLox } from "./lox-type-checking-utils.js";

describe("Test type checking for classes", () => {
    test("Class inheritance for assignments: correct", async () => {
        await validateLox(
            `
            class MyClass1 { name: string age: number }
            class MyClass2 < MyClass1 {}
            var v1: MyClass1 = MyClass2();
        `,
            0,
        );
        expectTypirTypes(
            loxServices.typir,
            isClassType,
            "MyClass1",
            "MyClass2",
        );
    });

    test("Class inheritance for assignments: wrong", async () => {
        await validateLox(
            `
            class MyClass1 { name: string age: number }
            class MyClass2 < MyClass1 {}
            var v1: MyClass2 = MyClass1();
        `,
            1,
        );
        expectTypirTypes(
            loxServices.typir,
            isClassType,
            "MyClass1",
            "MyClass2",
        );
    });

    test("Class fields: correct values", async () => {
        await validateLox(
            `
            class MyClass1 { name: string age: number }
            var v1: MyClass1 = MyClass1();
            v1.name = "Bob";
            v1.age = 42;
        `,
            0,
        );
        expectTypirTypes(loxServices.typir, isClassType, "MyClass1");
    });

    test("Class fields: wrong values", async () => {
        await validateLox(
            `
            class MyClass1 { name: string age: number }
            var v1: MyClass1 = MyClass1();
            v1.name = 42;
            v1.age = "Bob";
        `,
            2,
        );
        expectTypirTypes(loxServices.typir, isClassType, "MyClass1");
    });

    test("Classes must be unique by name 2", async () => {
        await validateLox(
            `
            class MyClass1 { }
            class MyClass1 { }
        `,
            [
                "Declared classes need to be unique (MyClass1).",
                "Declared classes need to be unique (MyClass1).",
            ],
        );
        expectTypirTypes(loxServices.typir, isClassType, "MyClass1");
    });

    test("Classes must be unique by name 3", async () => {
        await validateLox(
            `
            class MyClass2 { }
            class MyClass2 { }
            class MyClass2 { }
        `,
            [
                "Declared classes need to be unique (MyClass2).",
                "Declared classes need to be unique (MyClass2).",
                "Declared classes need to be unique (MyClass2).",
            ],
        );
        expectTypirTypes(loxServices.typir, isClassType, "MyClass2");
    });
});

describe("Class literals", () => {
    test("Class literals 1", async () => {
        await validateLox(
            `
            class MyClass { name: string age: number }
            var v1 = MyClass(); // constructor call
        `,
            [],
        );
        expectTypirTypes(loxServices.typir, isClassType, "MyClass");
    });

    test("Class literals 2", async () => {
        await validateLox(
            `
            class MyClass { name: string age: number }
            var v1: MyClass = MyClass(); // constructor call
        `,
            [],
        );
        expectTypirTypes(loxServices.typir, isClassType, "MyClass");
    });

    test("Class literals 3", async () => {
        await validateLox(
            `
            class MyClass1 {}
            class MyClass2 {}
            var v1: boolean = MyClass1() == MyClass2(); // comparing objects with each other
        `,
            [],
            "This comparison will always return 'false' as 'MyClass1()' and 'MyClass2()' have the different types 'MyClass1' and 'MyClass2'.",
        );
        expectTypirTypes(
            loxServices.typir,
            isClassType,
            "MyClass1",
            "MyClass2",
        );
    });

    test("nil is assignable to any Class", async () => {
        await validateLox(
            `
            class MyClass1 {}
            class MyClass2 {}
            var v1 = MyClass1();
            var v2: MyClass2 = MyClass2();
            v1 = nil;
            v2 = nil;
        `,
            [],
        );
        expectTypirTypes(
            loxServices.typir,
            isClassType,
            "MyClass1",
            "MyClass2",
        );
    });
});

describe("Class field access", () => {
    test("simple class", async () => {
        const program = (
            await validateLox(
                `
            class MyClass { name: string age: number }
            var v1: MyClass = MyClass();
            var v2 = v1.name;
            var v3 = v1.age;
        `,
                [],
            )
        ).parseResult.value as LoxProgram;
        checkVariableDeclaration(program, "v2", "string");
        checkVariableDeclaration(program, "v3", "number");
    });

    test("different classes with switched properties", async () => {
        const program = (
            await validateLox(
                `
            class MyClass1 { name: string age: number }
            class MyClass2 { name: number age: string }
            var v1: MyClass1 = MyClass1();
            var v2: MyClass2 = MyClass2();
            var v1name = v1.name;
            var v1age  = v1.age;
            var v2name = v2.name;
            var v2age  = v2.age;
        `,
                [],
            )
        ).parseResult.value as LoxProgram;
        checkVariableDeclaration(program, "v1name", "string");
        checkVariableDeclaration(program, "v1age", "number");
        checkVariableDeclaration(program, "v2name", "number");
        checkVariableDeclaration(program, "v2age", "string");
    });

    function checkVariableDeclaration(
        program: LoxProgram,
        name: string,
        expectedType: "string" | "number",
    ): void {
        const variables = AstUtils.streamAllContents(program)
            .filter(isVariableDeclaration)
            .filter((v) => v.name === name)
            .toArray();
        expect(variables).toHaveLength(1);
        expectToBeType(
            loxServices.typir.Inference.inferType(variables[0]),
            isPrimitiveType,
            (inferred) => inferred.getName() === expectedType,
        );
    }
});
