/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { describe, expect, test } from 'vitest';
import { ClassFactoryService, ClassKind } from '../src/kinds/class/class-kind.js';
import { TestLanguageNode } from '../src/test/predefined-language-nodes.js';
import { createTypirServices, createTypirServicesWithAdditionalServices, TypirServices } from '../src/typir.js';
import { expectToBeType } from '../src/index-test.js';
import { DefaultTypeConflictPrinter, isClassType, Type } from '../src/index.js';

describe('Some examples how to customize the Typir services, focusing on adding another type factory', () => {

    test('Demonstrate the default behaviour of classes', async () => {
        // Use the default configuration of Typir
        const typir = createTypirServices<TestLanguageNode>();
        // Create some classes
        const classA = typir.factory.Classes.create({ className: 'A', fields: [], methods: [], superClasses: [] }).finish().getTypeFinal()!;
        const classB = typir.factory.Classes.create({ className: 'B', fields: [], methods: [], superClasses: [] }).finish().getTypeFinal()!;
        expectToBeType(classA, isClassType, type => type.className === 'A');
        expectToBeType(classB, isClassType, type => type.className === 'B');
        // Not more than 1 super-class is allowed:
        expect(() => typir.factory.Classes.create({ className: 'C', fields: [], methods: [], superClasses: [classA, classB] }).finish())
            .toThrowError('Only 1 super-class is allowed.');
    });

    test('Update an existing type factory', async () => {
        // The service for creating classes already exists in the Typir services, but its implementation is configured:
        // - Here, only an option of the existing implementation is changed.
        // - But in general you could add a completely new implementation here.
        const typir = createTypirServices<TestLanguageNode>({
            factory: {
                Classes: services => new ClassKind(services, { maximumNumberOfSuperClasses: 2 }),
            },
        });
        // Create some classes
        const classA = typir.factory.Classes.create({ className: 'A', fields: [], methods: [], superClasses: [] }).finish().getTypeFinal()!;
        const classB = typir.factory.Classes.create({ className: 'B', fields: [], methods: [], superClasses: [] }).finish().getTypeFinal()!;
        expectToBeType(classA, isClassType, type => type.className === 'A');
        expectToBeType(classB, isClassType, type => type.className === 'B');
        // 2 super-classes are fine now:
        const classC = typir.factory.Classes.create({ className: 'C', fields: [], methods: [], superClasses: [classA, classB] }).finish().getTypeFinal()!;
        expect(classC).toBeTruthy();
    });

    test('Add another type factory', async () => {
        // Make the additional service explicit:
        //  In general, you can add an arbitrary number of services, which might be deeply nested
        type AdditionalExampleTypirServices = {
            readonly factory: {
                readonly OtherClasses: ClassFactoryService<TestLanguageNode>;
            },
        };
        type ExampleTypirServices = TypirServices<TestLanguageNode> & AdditionalExampleTypirServices;

        // Instantiate the services and provide implementations for all added services.
        const typir: ExampleTypirServices = createTypirServicesWithAdditionalServices<TestLanguageNode, AdditionalExampleTypirServices>({
            factory: {
                // Here we reuse the existing class kind implementation, but with a different configuration to demonstrate types with a different behaviour:
                OtherClasses: services => new ClassKind(services, { maximumNumberOfSuperClasses: 2, $name: 'OtherClass' }),
            },
        });

        // Default classes: not more than 1 super-class
        const classA = typir.factory.Classes.create({ className: 'A', fields: [], methods: [], superClasses: [] }).finish().getTypeFinal()!;
        const classB = typir.factory.Classes.create({ className: 'B', fields: [], methods: [], superClasses: [] }).finish().getTypeFinal()!;
        expectToBeType(classA, isClassType, type => type.className === 'A');
        expectToBeType(classB, isClassType, type => type.className === 'B');
        expect(() => typir.factory.Classes.create({ className: 'C', fields: [], methods: [], superClasses: [classA, classB] }).finish())
            .toThrowError('Only 1 super-class is allowed.');

        // New classes: 2 super-classes are fine now
        const classD = typir.factory.OtherClasses.create({ className: 'D', fields: [], methods: [], superClasses: [] }).finish().getTypeFinal()!;
        const classE = typir.factory.OtherClasses.create({ className: 'E', fields: [], methods: [], superClasses: [] }).finish().getTypeFinal()!;
        const classF = typir.factory.OtherClasses.create({ className: 'F', fields: [], methods: [], superClasses: [classD, classE] }).finish().getTypeFinal()!;
        expect(classF).toBeTruthy();
        expectToBeType(classD, isClassType, type => type.className === 'D');
        expectToBeType(classE, isClassType, type => type.className === 'E');
        expectToBeType(classF, isClassType, type => type.className === 'F');
    });

    test('Newly added services are usable by all other services', async () => {
        // new service
        interface TestService {
            doSomething(): string;
        }
        type AdditionalExampleTypirServices = {
            TestService: TestService;
        };
        // Defining the following TypeScript type "ExampleTypirServices" is not mandatory, but makes the customization with additional services easier.
        //  Without this type "ExampleTypirServices", you would need to replace all its occurrances by "TypirServices<TestLanguageNode> & AdditionalExampleTypirServices".
        type ExampleTypirServices = TypirServices<TestLanguageNode> & AdditionalExampleTypirServices;

        // implementation for the new service
        class TestServiceImpl implements TestService {
            readonly services: ExampleTypirServices;
            constructor(services: ExampleTypirServices) {
                this.services = services;
            }
            doSomething(): string {
                // all services are usable here!
                this.services.Assignability; // existing service
                this.services.TestService; // new service
                return 'something';
            }
        }

        // adapted implementation for an existing service
        class ExamplePrinter extends DefaultTypeConflictPrinter<TestLanguageNode> {
            readonly services: ExampleTypirServices;
            constructor(services: ExampleTypirServices) {
                super();
                this.services = services;
            }
            override printTypeName(type: Type): string {
                // new services are usable in (adapted) implementations for existing services
                return `${this.services.TestService.doSomething()}--${super.printTypeName(type)}`;
            }
        }

        // Instantiate the Typir services and provide implementations for all added and customized services:
        const typir: ExampleTypirServices = createTypirServicesWithAdditionalServices<TestLanguageNode, AdditionalExampleTypirServices>(
            // 1st argument: Specify implementations for all new services
            {
                TestService: services => new TestServiceImpl(services),
            },
            // 2nd argument: Customize some existing services here
            //  In general, the following optional arguments might customize all services (default and added ones)
            {
                Printer: services => new ExamplePrinter(services),
            },
            // some more optional customizations might be added here for convenience
        );

        // Create a type and check the new prefix
        const type = typir.factory.Primitives.create({ primitiveName: 'ABC' }).finish();
        expect(typir.Printer.printTypeName(type)).toBe('something--ABC');
    });

    test('Ensure unique names/identifiers when using different instances of the same kind class in parallel', async () => {
        // This test case demonstrates some issues and how to solve them for the Classes case.
        //  Depending on the kind, not all of theses issues occur or occur in a different way.
        //  This test case aims to point to these issues in general.
        type AdditionalExampleTypirServices = {
            readonly factory: {
                readonly OtherClasses: ClassFactoryService<TestLanguageNode>;
            },
        };
        type ExampleTypirServices = TypirServices<TestLanguageNode> & AdditionalExampleTypirServices;

        // Reusing the following default implementation causes some issues with unique names ...
        let typir: ExampleTypirServices = createTypirServicesWithAdditionalServices<TestLanguageNode, AdditionalExampleTypirServices>({
            factory: {
                OtherClasses: services => new ClassKind(services),
            },
        });

        // Each kind needs to have a unique $name
        expect(typir.factory.Classes).toBeTypeOf('object'); // trigger to create the default class factory, since they are created lazily
        expect(() => typir.factory.OtherClasses).toThrowError("duplicate kind named 'ClassKind'");
        typir = createTypirServicesWithAdditionalServices<TestLanguageNode, AdditionalExampleTypirServices>({
            factory: {
                OtherClasses: services => new ClassKind(services, {
                    $name: 'OtherClass', // specify another $name for the new kind
                }),
            },
        });
        expect(typir.factory.Classes).toBeTypeOf('object');
        expect(typir.factory.OtherClasses).toBeTypeOf('object'); // now both kinds are available and have different $names

        // Types need to have unique identifiers: this is ensured by having unique prefixes
        expectToBeType(typir.factory.Classes.create({ className: 'A', fields: [], methods: [] }).finish().getTypeFinal(), isClassType, type => type.className === 'A');
        expect(() => typir.factory.OtherClasses.create({ className: 'A', fields: [], methods: [] }).finish())
            .toThrowError("The identifier 'class-A' for the new type of kind 'OtherClass' (implemented in ClassKind) collides with the identifier 'class-A' of an existing type of kind 'ClassKind' (implemented in ClassKind).");
        typir = createTypirServicesWithAdditionalServices<TestLanguageNode, AdditionalExampleTypirServices>({
            factory: {
                OtherClasses: services => new ClassKind(services, {
                    $name: 'OtherClass',
                    identifierPrefix: 'other-class', // unique prefix for types of this kind
                }),
            },
        });
        expectToBeType(typir.factory.Classes.create({ className: 'A', fields: [], methods: [] }).finish().getTypeFinal(), isClassType, type => type.className === 'A');
        expectToBeType(typir.factory.OtherClasses.create({ className: 'A', fields: [], methods: [] }).finish().getTypeFinal(), isClassType, type => type.className === 'A');
    });

    test('Removing an existing type factory', async () => {
        // Removing an existing type factory is not possible and does not make sense, since other default services might use this service.
        // - Simple approach: Just don't use this service anymore.
        // - More explicit approach: Throw an exception whenever this service is used, as demonstrated here:
        const typir = createTypirServices<TestLanguageNode>({
            factory: {
                Classes: () => { throw new Error('Do not use classes!'); },
            },
        });
        expect(() => typir.factory.Classes).toThrowError('Do not use classes!');
    });

});
