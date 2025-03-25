/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { expect } from 'vitest';
import { Type } from '../graph/type-node.js';
import { TestLanguageNode, TestLanguageService, TestProblemPrinter } from '../test/predefined-language-nodes.js';
import { createDefaultTypirServicesModule, createTypirServices, PartialTypirServices, TypirServices } from '../typir.js';
import { Module } from './dependency-injection.js';
import { Severity } from '../services/validation.js';

/**
 * Testing utility to check, that exactly the expected types are in the type system.
 * @param services the Typir services
 * @param filterTypes used to identify the types of interest
 * @param namesOfExpectedTypes the names (not the identifiers!) of the expected types;
 * ensures that there are no more types;
 * it is possible to specify names multiple times, if there are multiple types with the same name (e.g. for overloaded functions)
 * @returns all the found types
 */
export function expectTypirTypes<LanguageType>(services: TypirServices<LanguageType>, filterTypes: (type: Type) => boolean, ...namesOfExpectedTypes: string[]): Type[] {
    const types = services.infrastructure.Graph.getAllRegisteredTypes().filter(filterTypes);
    types.forEach(type => expect(type.getInitializationState()).toBe('Completed')); // check that all types are 'Completed'
    const typeNames = types.map(t => t.getName());
    expect(typeNames, typeNames.join(', ')).toHaveLength(namesOfExpectedTypes.length);
    for (const name of namesOfExpectedTypes) {
        const index = typeNames.indexOf(name);
        expect(index >= 0).toBeTruthy();
        typeNames.splice(index, 1); // removing elements is needed to work correctly with duplicated entries
    }
    expect(typeNames, `There are more types than expected: ${typeNames.join(', ')}`).toHaveLength(0);
    return types;
}

export function expectToBeType<T extends Type>(type: unknown, checkType: (t: unknown) => t is T, checkDetails: (t: T) => boolean): void {
    if (checkType(type)) {
        if (checkDetails(type)) {
            // everything is fine
        } else {
            expect.fail(`'${type.getIdentifier()}' is the actual Typir type, but the details are wrong`);
        }
    } else {
        expect.fail(`'${type}' is not the expected Typir type`);
    }
}


/**
 * Tests, whether exactly the specified issues are found during the validation of the given language node,
 * i.e. neither more nor less validation issues.
 * @param services the Typir services
 * @param languageNode the language node to validate
 * @param expectedIssues the expected issues to occur
 */
export function expectValidationIssues<LanguageType>(services: TypirServices<LanguageType>, languageNode: LanguageType, expectedIssues: string[]): void;
/**
 * Tests, whether the specified issues are found during the validation of the given language node,
 * more validation issues beyond the specified ones might occur.
 * @param services the Typir services
 * @param languageNode the language node to validate
 * @param options These options are used to filter all occurred issues before the expectations are checked
 * @param expectedIssues the expected issues to occur
 */
export function expectValidationIssues<LanguageType>(services: TypirServices<LanguageType>, languageNode: LanguageType, options: ExpectedValidationIssuesOptions, expectedIssues: string[]): void;
export function expectValidationIssues<LanguageType>(services: TypirServices<LanguageType>, languageNode: LanguageType, optionsOrIssues: ExpectedValidationIssuesOptions | string[], issues?: string[]): void {
    const expectedIssues = Array.isArray(optionsOrIssues) ? optionsOrIssues : issues ?? [];
    const options = Array.isArray(optionsOrIssues) ? {} : optionsOrIssues;
    const actualIssues = validateAndFilter(services, languageNode, options);
    compareValidationIssues(actualIssues, expectedIssues);
}

/**
 * Tests, whether exactly the specified issues are found during the validation of the given language node,
 * i.e. neither more nor less validation issues.
 * @param services the Typir services
 * @param languageNode the language node to validate
 * @param expectedStrictIssues the expected issues to occur
 */
export function expectValidationIssuesStrict<LanguageType>(services: TypirServices<LanguageType>, languageNode: LanguageType, expectedStrictIssues: string[]): void;
/**
 * Tests, whether exactly the specified issues are found during the validation of the given language node,
 * i.e. neither more nor less validation issues.
 * @param services the Typir services
 * @param languageNode the language node to validate
 * @param options These options are used to filter all occurred issues before the expectations are checked
 * @param expectedStrictIssues the expected issues to occur
 */
export function expectValidationIssuesStrict<LanguageType>(services: TypirServices<LanguageType>, languageNode: LanguageType, options: ExpectedValidationIssuesOptions, expectedStrictIssues: string[]): void;
export function expectValidationIssuesStrict<LanguageType>(services: TypirServices<LanguageType>, languageNode: LanguageType, optionsOrIssues: ExpectedValidationIssuesOptions | string[], issues?: string[]): void {
    const expectedStrictIssues = Array.isArray(optionsOrIssues) ? optionsOrIssues : issues ?? [];
    const options = Array.isArray(optionsOrIssues) ? {} : optionsOrIssues;
    const actualIssues = validateAndFilter(services, languageNode, options);
    compareValidationIssuesStrict(actualIssues, expectedStrictIssues);
}

/**
 * Tests, whether the specified issues are NOT found during the validation of the given language node,
 * other validation issues than the specified ones might occur.
 * @param services the Typir services
 * @param languageNode the language node to validate
 * @param forbiddenIssues the issues which are expected to NOT occur
 */
export function expectValidationIssuesAbsent<LanguageType>(services: TypirServices<LanguageType>, languageNode: LanguageType, forbiddenIssues: string[]): void;
/**
 * Tests, whether the specified issues are NOT found during the validation of the given language node,
 * other validation issues than the specified ones might occur.
 * @param services the Typir services
 * @param languageNode the language node to validate
 * @param options These options are used to filter all occurred issues before the expectations are checked
 * @param forbiddenIssues the issues which are expected to NOT occur
 */
export function expectValidationIssuesAbsent<LanguageType>(services: TypirServices<LanguageType>, languageNode: LanguageType, options: ExpectedValidationIssuesOptions, forbiddenIssues: string[]): void;
export function expectValidationIssuesAbsent<LanguageType>(services: TypirServices<LanguageType>, languageNode: LanguageType, optionsOrIssues: ExpectedValidationIssuesOptions | string[], issues?: string[]): void {
    const expectedForbiddenIssues = Array.isArray(optionsOrIssues) ? optionsOrIssues : issues ?? [];
    const options = Array.isArray(optionsOrIssues) ? {} : optionsOrIssues;
    const actualIssues = validateAndFilter(services, languageNode, options);
    compareValidationIssuesAbsent(actualIssues, expectedForbiddenIssues);
}

/**
 * Tests, whether no issues at all are found during the validation of the given language node.
 * @param services the Typir services
 * @param languageNode the language node to validate
 * @param options These options are used to filter all occurred issues before the expectations are checked
 */
export function expectValidationIssuesNone<LanguageType>(services: TypirServices<LanguageType>, languageNode: LanguageType, options?: ExpectedValidationIssuesOptions): void {
    const optionsToUse = options ?? {};
    const actualIssues = validateAndFilter(services, languageNode, optionsToUse);
    compareValidationIssuesNone(actualIssues);
}

export interface ExpectedValidationIssuesOptions {
    /** Check only issues which have the specified severity (or check all issues in case of an 'undefined' severity) */
    severity?: Severity;
    // more properties for filtering might be added in the future
}

function validateAndFilter<LanguageType>(services: TypirServices<LanguageType>, languageNode: LanguageType, options: ExpectedValidationIssuesOptions): string[] {
    return services.validation.Collector.validate(languageNode)
        .filter(v => options.severity ? v.severity === options.severity : true)
        .map(v => services.Printer.printTypirProblem(v));
}

export function compareValidationIssues(actualIssues: string[], expectedIssues: string[]): void {
    compareValidationIssuesLogic(actualIssues, expectedIssues);
}
export function compareValidationIssuesStrict(actualIssues: string[], expectedStrictIssues: string[]): void {
    compareValidationIssuesLogic(actualIssues, expectedStrictIssues, { strict: true });
}
export function compareValidationIssuesAbsent(actualIssues: string[], forbiddenIssues: string[]): void {
    compareValidationIssuesLogicAbsent(actualIssues, forbiddenIssues);
}
export function compareValidationIssuesNone(actualIssues: string[]): void {
    compareValidationIssuesLogic(actualIssues, [], { strict: true });
}

function compareValidationIssuesLogic(actualIssues: string[], expectedErrors: string[], options?: { strict?: boolean }): void {
    // compare actual and expected issues
    let indexExpected = 0;
    while (indexExpected < expectedErrors.length) {
        let indexActual = 0;
        let found = false;
        while (indexActual < actualIssues.length) {
            if (actualIssues[indexActual].includes(expectedErrors[indexExpected])) {
                found = true;
                // remove found matches => at the end, the not matching issues remain to be reported
                actualIssues.splice(indexActual, 1);
                expectedErrors.splice(indexExpected, 1);
                break;
            }
            indexActual++;
        }
        if (found) {
            // indexExpected was implicitly incremented
        } else {
            indexExpected++;
        }
    }
    // report the result
    const msgExpected = expectedErrors.join('\n').trim();
    const msgActual = actualIssues.join('\n').trim();
    if (msgExpected.length >= 1 && msgActual.length >= 1) {
        if (options?.strict) {
            expect.fail(`Didn't find expected issues:\n${msgExpected}\nBut found some more issues:\n${msgActual}`);
        } else {
            expect.fail(`Didn't find expected issues:\n${msgExpected}\nThese other issues are ignored:\n${msgActual}`);
            // printing the ignored issues help to identify typos, ... in the specified issues
        }
    } else if (msgExpected.length >= 1) {
        expect.fail(`Didn't find expected issues:\n${msgExpected}`);
    } else if (msgActual.length >= 1) {
        if (options?.strict) {
            expect.fail(`Found some more issues:\n${msgActual}`);
        } else {
            // ignore additional issues
        }
    } else {
        // everything is fine
    }
}
function compareValidationIssuesLogicAbsent(actualIssues: string[], forbiddenErrors: string[]): void {
    // compare actual and expected issues
    let indexExpected = 0;
    while (indexExpected < forbiddenErrors.length) {
        let indexActual = 0;
        let found = false;
        while (indexActual < actualIssues.length) {
            if (actualIssues[indexActual].includes(forbiddenErrors[indexExpected])) {
                found = true;
                break;
            }
            indexActual++;
        }
        if (found) {
            indexExpected++;
        } else {
            // remove issues which did not occur => at the end, the issues which occurred remain to be reported
            actualIssues.splice(indexActual, 1);
            forbiddenErrors.splice(indexExpected, 1);
            // indexExpected was implicitly incremented
        }
    }
    // report the result
    const msgForbidden = forbiddenErrors.join('\n').trim();
    const msgActual = actualIssues.join('\n').trim();
    if (msgForbidden.length >= 1 && msgActual.length >= 1) {
        expect.fail(`Found these forbidden issues:\n${msgForbidden}\nThese other issues are ignored:\n${msgActual}`);
        // printing the ignored issues help to identify typos, ... in the specified forbidden issues
    } else if (msgForbidden.length >= 1) {
        expect.fail(`Found these forbidden issues:\n${msgForbidden}`);
    } else if (msgActual.length >= 1) {
        // ignore additional issues
    } else {
        // everything is fine
    }
}


/**
 * Creates TypirServices dedicated for testing purposes,
 * with the default module containing the default implements for Typir, which might be exchanged by the given optional customized module.
 * @param customizationForTesting specific customizations for the current test case
 * @returns a Typir instance, i.e. the TypirServices with implementations
 */
export function createTypirServicesForTesting(
    customizationForTesting: Module<TypirServices<TestLanguageNode>, PartialTypirServices<TestLanguageNode>> = {},
): TypirServices<TestLanguageNode> {
    return createTypirServices<TestLanguageNode>(
        createDefaultTypirServicesModule(),             // all default core implementations
        {                                               // override some default implementations:
            Printer: () => new TestProblemPrinter(),    // use the dedicated printer for TestLanguageNode's
            Language: () => new TestLanguageService(),  // provide language keys for the TestLanguageNode's: they are just the names of the classes (without extends so far)
        },
        customizationForTesting,                        // specific customizations for the current test case
    );
}
