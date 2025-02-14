/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { assertUnreachable } from 'langium';
import { TypeDetails } from '../../graph/type-node.js';
import { TypeInitializer } from '../../initialization/type-initializer.js';
import { TypeReference } from '../../initialization/type-reference.js';
import { TypeSelector } from '../../initialization/type-selector.js';
import { InferenceRuleNotApplicable } from '../../services/inference.js';
import { TypirServices } from '../../typir.js';
import { InferCurrentTypeRule } from '../../utils/utils-definitions.js';
import { TypeCheckStrategy } from '../../utils/utils-type-comparison.js';
import { assertTrue, assertType, toArray } from '../../utils/utils.js';
import { FunctionType } from '../function/function-type.js';
import { Kind, isKind } from '../kind.js';
import { ClassTypeInitializer } from './class-initializer.js';
import { ClassType, isClassType } from './class-type.js';
import { TopClassKind, TopClassKindName, isTopClassKind } from './top-class-kind.js';

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

export interface CreateMethodDetails {
    type: TypeSelector<FunctionType>;
}

export interface ClassTypeDetails extends TypeDetails {
    className: string;
    superClasses?: TypeSelector | TypeSelector[];
    fields: CreateFieldDetails[];
    methods: CreateMethodDetails[];
}
export interface CreateClassTypeDetails extends ClassTypeDetails {
    // inference rules for the Class
    inferenceRulesForClassDeclaration: Array<InferCurrentTypeRule<unknown>>;
    inferenceRulesForClassLiterals: Array<InferClassLiteral<unknown>>; // e.g. Constructor calls, References
    // inference rules for its Fields (TODO missing support)
    inferenceRulesForFieldAccess: Array<InferClassFieldAccess<unknown>>;
}

/**
 * Depending on whether the class is structurally or nominally typed,
 * different values might be specified, e.g. 'inputValuesForFields' could be empty for nominal classes.
 */
export interface InferClassLiteral<T = unknown> extends InferCurrentTypeRule<T> {
    inputValuesForFields: (languageNode: T) => Map<string, unknown>; // simple field name (including inherited fields) => value for this field!
}

export interface InferClassFieldAccess<T = unknown> extends InferCurrentTypeRule<T> {
    field: (languageNode: T) => string | unknown | InferenceRuleNotApplicable; // name of the field | language node to infer the type of the field (e.g. the type) | rule not applicable
}

export interface ClassFactoryService {
    create(typeDetails: ClassTypeDetails): ClassConfigurationChain;
    get(typeDetails: ClassTypeDetails | string): TypeReference<ClassType>;
}

export interface ClassConfigurationChain {
    inferenceRulesForClassDeclaration<T>(rule: InferCurrentTypeRule<T>): ClassConfigurationChain;
    inferenceRulesForClassLiterals<T>(rule: InferClassLiteral<T>): ClassConfigurationChain;

    inferenceRulesForFieldAccess<T>(rule: InferClassFieldAccess<T>): ClassConfigurationChain;

    finish(): TypeInitializer<ClassType>;
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
        this.services.infrastructure.Kinds.register(this);
        this.options = this.collectOptions(options);
        assertTrue(this.options.maximumNumberOfSuperClasses >= 0); // no negative values
    }

    protected collectOptions(options?: Partial<ClassKindOptions>): ClassKindOptions {
        return {
            // the default values:
            typing: 'Nominal',
            maximumNumberOfSuperClasses: 1,
            subtypeFieldChecking: 'EQUAL_TYPE',
            identifierPrefix: 'class',
            // the actually overriden values:
            ...options
        };
    }

    /**
     * For the use case, that a type is used/referenced, e.g. to specify the type of a variable declaration.
     * @param typeDetails all information needed to identify the class
     * @returns a reference to the class type, which might be resolved in the future, if the class type does not yet exist
     */
    get(typeDetails: ClassTypeDetails | string): TypeReference<ClassType> { // string for nominal typing
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
    create(typeDetails: ClassTypeDetails): ClassConfigurationChain {
        return new ClassConfigurationChainImpl(this.services, this, typeDetails);
    }

    protected getIdentifierPrefix(): string {
        return this.options.identifierPrefix ? (this.options.identifierPrefix + '-') : '';
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
    calculateIdentifier(typeDetails: ClassTypeDetails): string {
        // purpose of identifier: distinguish different types; NOT: not uniquely overloaded types
        if (this.options.typing === 'Structural') {
            // fields
            const fields: string = typeDetails.fields
                .map(f => `${f.name}:${this.services.infrastructure.TypeResolver.resolve(f.type).getIdentifier()}`) // the names and the types of the fields are relevant, since different field types lead to different class types!
                .sort() // the order of fields does not matter, therefore we need a stable order to make the identifiers comparable
                .join(',');
            // methods
            const methods: string = typeDetails.methods
                .map(m => this.services.infrastructure.TypeResolver.resolve(m.type).getIdentifier())
                .sort() // the order of methods does not matter, therefore we need a stable order to make the identifiers comparable
                .join(',');
            // super classes (TODO oder strukturell per getAllSuperClassX lösen?!)
            const superClasses: string = toArray(typeDetails.superClasses)
                .map(selector => {
                    const type = this.services.infrastructure.TypeResolver.resolve(selector);
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
    calculateIdentifierWithClassNameOnly(typeDetails: ClassTypeDetails): string {
        return `${this.getIdentifierPrefix()}${typeDetails.className}`;
    }


    getTopClassKind(): TopClassKind {
        // ensure, that Typir uses the predefined 'TopClass' kind
        const kind = this.services.infrastructure.Kinds.get(TopClassKindName);
        return isTopClassKind(kind) ? kind : new TopClassKind(this.services);
    }

}

export function isClassKind(kind: unknown): kind is ClassKind {
    return isKind(kind) && kind.$name === ClassKindName;
}


class ClassConfigurationChainImpl implements ClassConfigurationChain {
    protected readonly services: TypirServices;
    protected readonly kind: ClassKind;
    protected readonly typeDetails: CreateClassTypeDetails;

    constructor(services: TypirServices, kind: ClassKind, typeDetails: ClassTypeDetails) {
        this.services = services;
        this.kind = kind;
        this.typeDetails = {
            ...typeDetails,
            inferenceRulesForClassDeclaration: [],
            inferenceRulesForClassLiterals: [],
            inferenceRulesForFieldAccess: [],
        };
    }

    inferenceRulesForClassDeclaration<T>(rule: InferCurrentTypeRule<T>): ClassConfigurationChain {
        this.typeDetails.inferenceRulesForClassDeclaration.push(rule as InferCurrentTypeRule<unknown>);
        return this;
    }

    inferenceRulesForClassLiterals<T>(rule: InferClassLiteral<T>): ClassConfigurationChain {
        this.typeDetails.inferenceRulesForClassLiterals.push(rule as InferClassLiteral<unknown>);
        return this;
    }

    inferenceRulesForFieldAccess<T>(rule: InferClassFieldAccess<T>): ClassConfigurationChain {
        this.typeDetails.inferenceRulesForFieldAccess.push(rule as InferClassFieldAccess<unknown>);
        return this;
    }

    finish(): TypeInitializer<ClassType> {
        return new ClassTypeInitializer(this.services, this.kind, this.typeDetails);
    }
}
