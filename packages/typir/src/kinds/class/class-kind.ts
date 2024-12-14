/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { assertUnreachable } from 'langium';
import { TypeInitializer } from '../../initialization/type-initializer.js';
import { TypeReference } from '../../initialization/type-reference.js';
import { TypeSelector } from '../../initialization/type-selector.js';
import { InferenceRuleNotApplicable } from '../../services/inference.js';
import { TypirServices } from '../../typir.js';
import { TypeCheckStrategy } from '../../utils/utils-type-comparison.js';
import { assertTrue, assertType, toArray } from '../../utils/utils.js';
import { CreateFunctionTypeDetails, FunctionFactoryService } from '../function/function-kind.js';
import { Kind, isKind } from '../kind.js';
import { ClassTypeInitializer } from './class-initializer.js';
import { ClassType, isClassType } from './class-type.js';
import { TopClassKind, TopClassKindName, TopClassTypeDetails, isTopClassKind } from './top-class-kind.js';
import { TopClassType } from './top-class-type.js';

export interface ClassKindOptions {
    typing: 'Structural' | 'Nominal', // JS classes are nominal, TS structures are structural
    /** Values < 0 indicate an arbitrary number of super classes. */
    maximumNumberOfSuperClasses: number,
    subtypeFieldChecking: TypeCheckStrategy,
    /** Will be used only internally as prefix for the unique identifiers for class type names. */
    identifierPrefix: string,
}

export const ClassKindName = 'ClassKind';

export interface CreateFieldDetails {
    name: string;
    type: TypeSelector;
}

export interface ClassTypeDetails<T = unknown> {
    className: string,
    superClasses?: TypeSelector | TypeSelector[],
    fields: CreateFieldDetails[],
    methods: Array<CreateFunctionTypeDetails<T>>, // all details of functions can be configured for methods as well, in particular, inference rules for function/method calls!
}
export interface CreateClassTypeDetails<T = unknown, T1 = unknown, T2 = unknown> extends ClassTypeDetails<T> { // TODO the generics look very bad!
    inferenceRuleForDeclaration?: (domainElement: unknown) => boolean, // TODO what is the purpose for this? what is the difference to literals?
    // TODO rename to Constructor call??
    inferenceRuleForLiteral?: InferClassLiteral<T1>, // InferClassLiteral<T> | Array<InferClassLiteral<T>>, does not work: https://stackoverflow.com/questions/65129070/defining-an-array-of-differing-generic-types-in-typescript
    inferenceRuleForReference?: InferClassLiteral<T2>,
    inferenceRuleForFieldAccess?: (domainElement: unknown) => string | unknown | InferenceRuleNotApplicable, // name of the field | element to infer the type of the field (e.g. the type) | rule not applicable
    // inference rules for Method calls are part of "methods: CreateFunctionTypeDetails[]" above!
}

// TODO nominal vs structural typing ??
export type InferClassLiteral<T = unknown> = {
    filter: (domainElement: unknown) => domainElement is T;
    matching: (domainElement: T) => boolean;
    inputValuesForFields: (domainElement: T) => Map<string, unknown>; // simple field name (including inherited fields) => value for this field! TODO implement that, [] for nominal typing
};


export interface ClassFactoryService {
    create<T, T1, T2>(typeDetails: CreateClassTypeDetails<T, T1, T2>): TypeInitializer<ClassType>;
    get<T>(typeDetails: ClassTypeDetails<T> | string): TypeReference<ClassType>;
}

/**
 * Classes have a name and have an arbitrary number of fields, consisting of a name and a type, and an arbitrary number of super-classes.
 * Fields have exactly one type and no multiplicity (which can be realized with a type of kind 'MultiplicityKind').
 * Fields have exactly one name which must be unique for the current class (TODO what about same field names in extended class?).
 * The field name is used to identify fields of classes.
 * The order of fields is not defined, i.e. there is no order of fields.
 */
export class ClassKind implements Kind, ClassFactoryService {
    readonly $name: 'ClassKind';
    readonly services: TypirServices;
    readonly options: Readonly<ClassKindOptions>;

    constructor(services: TypirServices, options?: Partial<ClassKindOptions>) {
        this.$name = ClassKindName;
        this.services = services;
        this.services.kinds.register(this);
        this.options = { // TODO in eigene Methode auslagern!
            // the default values:
            typing: 'Nominal',
            maximumNumberOfSuperClasses: 1,
            subtypeFieldChecking: 'EQUAL_TYPE',
            identifierPrefix: 'class',
            // the actually overriden values:
            ...options
        };
        assertTrue(this.options.maximumNumberOfSuperClasses >= 0); // no negative values
    }

    /**
     * For the use case, that a type is used/referenced, e.g. to specify the type of a variable declaration.
     * @param typeDetails all information needed to identify the class
     * @returns a reference to the class type, which might be resolved in the future, if the class type does not yet exist
     */
    get<T>(typeDetails: ClassTypeDetails<T> | string): TypeReference<ClassType> { // string for nominal typing
        if (typeof typeDetails === 'string') {
            // nominal typing
            return new TypeReference(typeDetails, this.services);
        } else {
            // structural typing (does this case occur in practise?)
            return new TypeReference(() => this.calculateIdentifier(typeDetails), this.services);
        }
    }

    /**
     * For the use case, that a new type needs to be created in Typir, e.g. for a class declaration.
     * This function ensures, that the same type is created only once, even if this function is called multiple times, if e.g. the same type might be created for different type declaration.
     * Nevertheless, usually a validation should produce an error in this case.
     * @param typeDetails all information needed to create a new class
     * @returns an initializer which creates and returns the new class type, when all depending types are resolved
     */
    create<T, T1, T2>(typeDetails: CreateClassTypeDetails<T, T1, T2>): TypeInitializer<ClassType> {
        return new ClassTypeInitializer(this.services, this, typeDetails);
    }

    getIdentifierPrefix(): string {
        return this.options.identifierPrefix ? this.options.identifierPrefix + '-' : '';
    }

    /**
     * This method calculates the identifier of a class with the given details.
     * Depending on structural or nominal typing of classes, the fields and methods or the name of the class will be used to compose the resulting identifier.
     * If some types for the properties of the class are missing, an exception will be thrown.
     *
     * Design decisions:
     * - This method is part of the ClassKind and not part of ClassType, since the ClassKind requires it for 'getClassType'!
     * - The kind might use/add additional prefixes for the identifiers to prevent collisions with types of other kinds,
     *   which might occur in some applications.
     *
     * @param typeDetails the details
     * @returns the new identifier
     */
    calculateIdentifier<T>(typeDetails: ClassTypeDetails<T>): string {
        // purpose of identifier: distinguish different types; NOT: not uniquely overloaded types
        if (this.options.typing === 'Structural') {
            // fields
            const fields: string = typeDetails.fields
                .map(f => `${f.name}:${this.services.infrastructure.typeResolver.resolve(f.type)}`) // the names and the types of the fields are relevant, since different field types lead to different class types!
                .sort() // the order of fields does not matter, therefore we need a stable order to make the identifiers comparable
                .join(',');
            // methods
            const functionFactory = this.getMethodFactory();
            const methods: string = typeDetails.methods
                .map(createMethodDetails => {
                    return functionFactory.calculateIdentifier(createMethodDetails); // reuse the Identifier for Functions here!
                })
                .sort() // the order of methods does not matter, therefore we need a stable order to make the identifiers comparable
                .join(',');
            // super classes (TODO oder strukturell per getAllSuperClassX lösen?!)
            const superClasses: string = toArray(typeDetails.superClasses)
                .map(selector => {
                    const type = this.services.infrastructure.typeResolver.resolve(selector);
                    assertType(type, isClassType);
                    return type.getIdentifier();
                })
                .sort()
                .join(',');
            // complete identifier (the name of the class does not matter for structural typing!)
            return `${this.getIdentifierPrefix()}fields{${fields}}-methods{${methods}}-extends{${superClasses}}`;
        } else if (this.options.typing === 'Nominal') {
            // only the name of the class matters for nominal typing!
            return this.calculateIdentifierWithClassNameOnly(typeDetails);
        } else {
            assertUnreachable(this.options.typing);
        }
    }

    /**
     * Calculates an identifier for classes which takes only the name of the class into account,
     * regardless of whether the class is structurally or nominally typed.
     * For structurally typed classes, this identifier might be used as well, since these names are usually used for reference in the DSL/AST!
     * @param typeDetails the details of the class
     * @returns the identifier based on the class name
     */
    calculateIdentifierWithClassNameOnly<T>(typeDetails: ClassTypeDetails<T>): string {
        return `${this.getIdentifierPrefix()}${typeDetails.className}`;
    }

    getMethodFactory(): FunctionFactoryService {
        return this.services.factory.functions;
    }

    getOrCreateTopClassType(typeDetails: TopClassTypeDetails): TopClassType {
        return this.getTopClassKind().getOrCreateTopClassType(typeDetails);
    }

    getTopClassKind(): TopClassKind {
        // ensure, that Typir uses the predefined 'TopClass' kind
        const kind = this.services.kinds.get(TopClassKindName);
        return isTopClassKind(kind) ? kind : new TopClassKind(this.services);
    }

}

export function isClassKind(kind: unknown): kind is ClassKind {
    return isKind(kind) && kind.$name === ClassKindName;
}
