/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { expect } from 'vitest';
import { Type } from '../graph/type-node.js';
import { TestLanguageNode, TestLanguageService, TestProblemPrinter } from '../test/predefined-language-nodes.js';
import { createDefaultTypirServiceModule, createTypirServices, PartialTypirServices, TypirServices } from '../typir.js';
import { Module } from './dependency-injection.js';

/**
 * Testing utility to check, that exactly the expected types are in the type system.
 * @param services the Typir services
 * @param filterTypes used to identify the types of interest
 * @param namesOfExpectedTypes the names (not the identifiers!) of the expected types;
 * ensures that there are no more types;
 * it is possible to specify names multiple times, if there are multiple types with the same name (e.g. for overloaded functions)
 * @returns all the found types
 */
export function expectTypirTypes<LanguageType = unknown>(services: TypirServices<LanguageType>, filterTypes: (type: Type) => boolean, ...namesOfExpectedTypes: string[]): Type[] {
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
 * Creates TypirServices dedicated for testing purposes,
 * with the default module containing the default implements for Typir, which might be exchanged by the given optional customized module.
 * @param customizationForTesting specific customizations for the current test case
 * @returns a Typir instance, i.e. the TypirServices with implementations
 */
export function createTypirServicesForTesting(
    customizationForTesting: Module<TypirServices<TestLanguageNode>, PartialTypirServices<TestLanguageNode>> = {},
): TypirServices<TestLanguageNode> {
    return createTypirServices<TestLanguageNode>(
        createDefaultTypirServiceModule(),                      // all default core implementations
        {                                               // override some default implementations:
            Printer: () => new TestProblemPrinter(),    // use the dedicated printer for TestLanguageNode's
            Language: () => new TestLanguageService(),  // provide language keys for the TestLanguageNode's: they are just the names of the classes (without extends so far)
        },
        customizationForTesting,                        // specific customizations for the current test case
    );
}
