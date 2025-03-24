/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { assertUnreachable } from 'langium';
import { Type, TypeDetails } from '../../graph/type-node.js';
import { TypeInitializer } from '../../initialization/type-initializer.js';
import { TypeReference } from '../../initialization/type-reference.js';
import { TypeSelector } from '../../initialization/type-selector.js';
import { InferenceRuleNotApplicable } from '../../services/inference.js';
import { ValidationRule } from '../../services/validation.js';
import { TypirServices } from '../../typir.js';
import { InferCurrentTypeRule, RegistrationOptions } from '../../utils/utils-definitions.js';
import { TypeCheckStrategy } from '../../utils/utils-type-comparison.js';
import { assertTrue, assertType, toArray } from '../../utils/utils.js';
import { FunctionType } from '../function/function-type.js';
import { Kind, isKind } from '../kind.js';
import { ClassTypeInitializer } from './class-initializer.js';
import { ClassType, isClassType } from './class-type.js';
import { NoSuperClassCyclesValidationOptions, UniqueClassValidation, UniqueMethodValidation, UniqueMethodValidationOptions, createNoSuperClassCyclesValidation } from './class-validation.js';
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

export interface CreateFieldDetails<LanguageType = unknown> {
    name: string;
    type: TypeSelector<Type, LanguageType>;
}

export interface CreateMethodDetails<LanguageType = unknown> {
    type: TypeSelector<FunctionType, LanguageType>;
}

export interface ClassTypeDetails<LanguageType = unknown> extends TypeDetails<LanguageType> {
    className: string;
    superClasses?: TypeSelector<ClassType, LanguageType> | Array<TypeSelector<ClassType, LanguageType>>;
    fields: Array<CreateFieldDetails<LanguageType>>;
    methods: Array<CreateMethodDetails<LanguageType>>;
}
export interface CreateClassTypeDetails<LanguageType = unknown> extends ClassTypeDetails<LanguageType> {
    // inference rules for the Class
    inferenceRulesForClassDeclaration: Array<InferCurrentTypeRule<ClassType, LanguageType>>;
    inferenceRulesForClassLiterals: Array<InferClassLiteral<LanguageType>>; // e.g. Constructor calls, References
    // inference rules for its Fields (TODO missing support)
    inferenceRulesForFieldAccess: Array<InferClassFieldAccess<LanguageType>>;
}

/**
 * Depending on whether the class is structurally or nominally typed,
 * different values might be specified, e.g. 'inputValuesForFields' could be empty for nominal classes.
 */
export interface InferClassLiteral<LanguageType = unknown, T extends LanguageType = LanguageType> extends InferCurrentTypeRule<ClassType, LanguageType, T> {
    inputValuesForFields: (languageNode: T) => Map<string, LanguageType>; // simple field name (including inherited fields) => value for this field!
}

export interface InferClassFieldAccess<LanguageType = unknown, T extends LanguageType = LanguageType> extends InferCurrentTypeRule<ClassType, LanguageType, T> {
    field: (languageNode: T) => string | LanguageType | InferenceRuleNotApplicable; // name of the field | language node to infer the type of the field (e.g. the type) | rule not applicable
}

export interface ClassFactoryService<LanguageType = unknown> {
    create(typeDetails: ClassTypeDetails<LanguageType>): ClassConfigurationChain<LanguageType>;
    get(typeDetails: ClassTypeDetails<LanguageType> | string): TypeReference<ClassType, LanguageType>;

    // some predefined valitions:

    createUniqueClassValidation(options: RegistrationOptions): UniqueClassValidation<LanguageType>;

    createUniqueMethodValidation<T extends LanguageType>(options: UniqueMethodValidationOptions<LanguageType, T> & RegistrationOptions): ValidationRule<LanguageType>;

    createNoSuperClassCyclesValidation(options: NoSuperClassCyclesValidationOptions<LanguageType> & RegistrationOptions): ValidationRule<LanguageType>;

    // benefits of this design decision: the returned rule is easier to exchange, users can use the known factory API with auto-completion (no need to remember the names of the validations)
}

export interface ClassConfigurationChain<LanguageType = unknown> {
    inferenceRuleForClassDeclaration<T extends LanguageType>(rule: InferCurrentTypeRule<ClassType, LanguageType, T>): ClassConfigurationChain<LanguageType>;
    inferenceRuleForClassLiterals<T extends LanguageType>(rule: InferClassLiteral<LanguageType, T>): ClassConfigurationChain<LanguageType>;

    inferenceRuleForFieldAccess<T extends LanguageType>(rule: InferClassFieldAccess<LanguageType, T>): ClassConfigurationChain<LanguageType>;

    finish(): TypeInitializer<ClassType, LanguageType>;
}


/**
 * Classes have a name and have an arbitrary number of fields, consisting of a name and a type, and an arbitrary number of super-classes.
 * Fields have exactly one type and no multiplicity (which can be realized with a type of kind 'MultiplicityKind').
 * Fields have exactly one name which must be unique for the current class (TODO what about same field names in extended class?).
 * The field name is used to identify fields of classes.
 * The order of fields is not defined, i.e. there is no order of fields.
 */
export class ClassKind<LanguageType = unknown> implements Kind, ClassFactoryService<LanguageType> {
    readonly $name: 'ClassKind';
    readonly services: TypirServices<LanguageType>;
    readonly options: Readonly<ClassKindOptions>;

    constructor(services: TypirServices<LanguageType>, options?: Partial<ClassKindOptions>) {
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
    get(typeDetails: ClassTypeDetails<LanguageType> | string): TypeReference<ClassType, LanguageType> { // string for nominal typing
        if (typeof typeDetails === 'string') {
            // nominal typing
            return new TypeReference<ClassType, LanguageType>(typeDetails, this.services);
        } else {
            // structural typing (does this case occur in practise?)
            return new TypeReference<ClassType, LanguageType>(() => this.calculateIdentifier(typeDetails), this.services);
        }
    }

    /**
     * For the use case, that a new type needs to be created in Typir, e.g. for a class declaration.
     * This function ensures, that the same type is created only once, even if this function is called multiple times, if e.g. the same type might be created for different type declaration.
     * Nevertheless, usually a validation should produce an error in this case.
     * @param typeDetails all information needed to create a new class
     * @returns an initializer which creates and returns the new class type, when all depending types are resolved
     */
    create(typeDetails: ClassTypeDetails<LanguageType>): ClassConfigurationChain<LanguageType> {
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
    calculateIdentifier(typeDetails: ClassTypeDetails<LanguageType>): string {
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
    calculateIdentifierWithClassNameOnly(typeDetails: ClassTypeDetails<LanguageType>): string {
        return `${this.getIdentifierPrefix()}${typeDetails.className}`;
    }


    getTopClassKind(): TopClassKind<LanguageType> {
        // ensure, that Typir uses the predefined 'TopClass' kind
        const kind = this.services.infrastructure.Kinds.get(TopClassKindName);
        return isTopClassKind<LanguageType>(kind) ? kind : new TopClassKind<LanguageType>(this.services);
    }

    createUniqueClassValidation(options: RegistrationOptions): UniqueClassValidation<LanguageType> {
        const rule = new UniqueClassValidation<LanguageType>(this.services);
        if (options.registration === 'MYSELF') {
            // do nothing, the user is responsible to register the rule
        } else {
            this.services.validation.Collector.addValidationRule(rule, options.registration);
        }
        return rule;
    }

    createUniqueMethodValidation<T extends LanguageType>(options: UniqueMethodValidationOptions<LanguageType, T> & RegistrationOptions): ValidationRule<LanguageType> {
        const rule = new UniqueMethodValidation<LanguageType, T>(this.services, options);
        if (options.registration === 'MYSELF') {
            // do nothing, the user is responsible to register the rule
        } else {
            this.services.validation.Collector.addValidationRule(rule, options.registration);
        }
        return rule;
    }

    createNoSuperClassCyclesValidation(options: NoSuperClassCyclesValidationOptions<LanguageType> & RegistrationOptions): ValidationRule<LanguageType> {
        const rule = createNoSuperClassCyclesValidation<LanguageType>(options);
        if (options.registration === 'MYSELF') {
            // do nothing, the user is responsible to register the rule
        } else {
            this.services.validation.Collector.addValidationRule(rule, options.registration);
        }
        return rule;
    }
}

export function isClassKind<LanguageType = unknown>(kind: unknown): kind is ClassKind<LanguageType> {
    return isKind(kind) && kind.$name === ClassKindName;
}


class ClassConfigurationChainImpl<LanguageType = unknown> implements ClassConfigurationChain<LanguageType> {
    protected readonly services: TypirServices<LanguageType>;
    protected readonly kind: ClassKind<LanguageType>;
    protected readonly typeDetails: CreateClassTypeDetails<LanguageType>;

    constructor(services: TypirServices<LanguageType>, kind: ClassKind<LanguageType>, typeDetails: ClassTypeDetails<LanguageType>) {
        this.services = services;
        this.kind = kind;
        this.typeDetails = {
            ...typeDetails,
            inferenceRulesForClassDeclaration: [],
            inferenceRulesForClassLiterals: [],
            inferenceRulesForFieldAccess: [],
        };
    }

    inferenceRuleForClassDeclaration<T extends LanguageType>(rule: InferCurrentTypeRule<ClassType, LanguageType, T>): ClassConfigurationChain<LanguageType> {
        this.typeDetails.inferenceRulesForClassDeclaration.push(rule as unknown as InferCurrentTypeRule<ClassType, LanguageType>);
        return this;
    }

    inferenceRuleForClassLiterals<T extends LanguageType>(rule: InferClassLiteral<LanguageType, T>): ClassConfigurationChain<LanguageType> {
        this.typeDetails.inferenceRulesForClassLiterals.push(rule as unknown as InferClassLiteral<LanguageType>);
        return this;
    }

    inferenceRuleForFieldAccess<T extends LanguageType>(rule: InferClassFieldAccess<LanguageType, T>): ClassConfigurationChain<LanguageType> {
        this.typeDetails.inferenceRulesForFieldAccess.push(rule as unknown as InferClassFieldAccess<LanguageType>);
        return this;
    }

    finish(): TypeInitializer<ClassType, LanguageType> {
        return new ClassTypeInitializer<LanguageType>(this.services, this.kind, this.typeDetails);
    }
}
