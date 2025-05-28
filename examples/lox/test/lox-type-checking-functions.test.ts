/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import {
    assertTrue,
    assertTypirType,
    isFunctionType,
    isPrimitiveType,
    isType,
} from "typir";
import { expectTypirTypes } from "typir/test";
import { describe, expect, test } from "vitest";
import {
    isFunctionDeclaration,
    isMemberCall,
    LoxProgram,
} from "../src/language/generated/ast.js";
import {
    loxServices,
    operatorNames,
    validateLox,
} from "./lox-type-checking-utils.js";

describe("Test type checking for user-defined functions", () => {
    test("function: return value and return type must match", async () => {
        await validateLox("fun myFunction1() : boolean { return true; }", 0);
        await validateLox(
            "fun myFunction2() : boolean { return 2; }",
            "The expression '2' of type 'number' is not usable as return value for the function 'myFunction2' with return type 'boolean'.",
        );
        await validateLox("fun myFunction3() : number { return 2; }", 0);
        await validateLox(
            "fun myFunction4() : number { return true; }",
            "The expression 'true' of type 'boolean' is not usable as return value for the function 'myFunction4' with return type 'number'.",
        );
        expectTypirTypes(
            loxServices.typir,
            isFunctionType,
            "myFunction1",
            "myFunction2",
            "myFunction3",
            "myFunction4",
            ...operatorNames,
        );
    });

    test("overloaded function: different return types are not enough", async () => {
        await validateLox(
            `
            fun myFunction() : boolean { return true; }
            fun myFunction() : number { return 2; }
        `,
            [
                "Declared functions need to be unique (myFunction()).",
                "Declared functions need to be unique (myFunction()).",
            ],
        );
        expectTypirTypes(
            loxServices.typir,
            isFunctionType,
            "myFunction",
            "myFunction",
            ...operatorNames,
        ); // the types are different nevertheless!
    });

    test("overloaded function: different parameter names are not enough", async () => {
        await validateLox(
            `
            fun myFunction(input: boolean) : boolean { return true; }
            fun myFunction(other: boolean) : boolean { return true; }
        `,
            [
                "Declared functions need to be unique (myFunction(boolean)).",
                "Declared functions need to be unique (myFunction(boolean)).",
            ],
        );
        expectTypirTypes(
            loxServices.typir,
            isFunctionType,
            "myFunction",
            ...operatorNames,
        ); // but both functions have the same type!
    });

    test("overloaded function: but different parameter types are fine", async () => {
        await validateLox(
            `
            fun myFunction(input: boolean) : boolean { return true; }
            fun myFunction(input: number) : boolean { return true; }
        `,
            [],
        );
        expectTypirTypes(
            loxServices.typir,
            isFunctionType,
            "myFunction",
            "myFunction",
            ...operatorNames,
        );
    });

    test("overloaded function: check correct type inference and cross-references", async () => {
        const rootNode = (
            await validateLox(
                `
            fun myFunction(input: number) : number { return 987; }
            fun myFunction(input: boolean) : boolean { return true; }
            myFunction(123);
            myFunction(false);
        `,
                [],
            )
        ).parseResult.value as LoxProgram;
        expectTypirTypes(
            loxServices.typir,
            isFunctionType,
            "myFunction",
            "myFunction",
            ...operatorNames,
        );

        // check type inference + cross-reference of the two method calls
        expect(rootNode.elements).toHaveLength(4);

        // Call 1 should be number
        const call1Node = rootNode.elements[2];
        // check cross-reference
        assertTrue(isMemberCall(call1Node));
        const method1 = call1Node.element?.ref;
        assertTrue(isFunctionDeclaration(method1));
        expect(method1.returnType.primitive).toBe("number");
        // check type inference
        const call1Type = loxServices.typir.Inference.inferType(call1Node);
        expect(isType(call1Type)).toBeTruthy();
        assertTypirType(call1Type, isPrimitiveType);
        expect(call1Type.getName()).toBe("number");

        // Call 2 should be boolean
        const call2Node = rootNode.elements[3];
        // check cross-reference
        assertTrue(isMemberCall(call2Node));
        const method2 = call2Node.element?.ref;
        assertTrue(isFunctionDeclaration(method2));
        expect(method2.returnType.primitive).toBe("boolean");
        // check type inference
        const call2Type = loxServices.typir.Inference.inferType(call2Node);
        expect(isType(call2Type)).toBeTruthy();
        assertTypirType(call2Type, isPrimitiveType);
        expect(call2Type.getName()).toBe("boolean");
    });
});
