/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { ValidationProblemAcceptor, ValidationRuleLifecycle } from '../../services/validation.js';
import { TypirServices, TypirSpecifics } from '../../typir.js';
import { FunctionType, isFunctionType } from '../function/function-type.js';
import { ClassType, isClassType } from './class-type.js';

/**
 * Predefined validation to produce errors, if the same class is declared more than once.
 * This is often relevant for nominally typed classes.
 */
export class UniqueClassValidation<Specifics extends TypirSpecifics> implements ValidationRuleLifecycle<Specifics> {
    protected readonly foundDeclarations: Map<string, Array<Specifics['LanguageType']>> = new Map();

    protected readonly services: TypirServices<Specifics>;
    protected readonly isRelevant: ((languageNode: Specifics['LanguageType']) => boolean) | undefined; // using this check improves performance

    constructor(services: TypirServices<Specifics>, isRelevant?: (languageNode: Specifics['LanguageType']) => boolean) {
        this.services = services;
        this.isRelevant = isRelevant;
    }

    beforeValidation(_languageRoot: Specifics['LanguageType'], _accept: ValidationProblemAcceptor<Specifics>, _typir: TypirServices<Specifics>): void {
        this.foundDeclarations.clear();
    }

    validation(languageNode: Specifics['LanguageType'], _accept: ValidationProblemAcceptor<Specifics>, _typir: TypirServices<Specifics>): void {
        if (this.isRelevant === undefined || this.isRelevant(languageNode)) { // improves performance, since type inference need to be done only for relevant language nodes
            const type = this.services.Inference.inferType(languageNode);
            if (isClassType(type)) {
                // register language nodes which have ClassTypes with a key for their uniques
                const key = this.calculateClassKey(type);
                let entries = this.foundDeclarations.get(key);
                if (!entries) {
                    entries = [];
                    this.foundDeclarations.set(key, entries);
                }
                entries.push(languageNode);
            }
        }
    }

    /**
     * Calculates a key for a class which encodes its unique properties, i.e. duplicate classes have the same key.
     * This key is used to identify duplicated classes.
     * Override this method to change the properties which make a class unique.
     * @param clas the current class type
     * @returns a string key
     */
    protected calculateClassKey(clas: ClassType): string {
        // usually duplicated classes are critical only for nominal typing, therefore the classname is used as default implementation here
        return `${clas.className}`;
    }

    afterValidation(_languageRoot: Specifics['LanguageType'], accept: ValidationProblemAcceptor<Specifics>, _typir: TypirServices<Specifics>): void {
        for (const [key, classes] of this.foundDeclarations.entries()) {
            if (classes.length >= 2) {
                for (const clas of classes) {
                    this.reportNonUniqueClass(clas, key, accept);
                }
            }
        }
        this.foundDeclarations.clear();
    }

    protected reportNonUniqueClass(clas: Specifics['LanguageType'], key: string, accept: ValidationProblemAcceptor<Specifics>): void {
        accept({
            languageNode: clas,
            severity: 'error',
            message: `Declared classes need to be unique (${key}).`,
        });
    }

    isClassDuplicated(clas: ClassType): boolean {
        const key = this.calculateClassKey(clas);
        return this.foundDeclarations.has(key) && this.foundDeclarations.get(key)!.length >= 2;
    }
}

interface UniqueMethodValidationEntry<Specifics extends TypirSpecifics> {
    languageNode: Specifics['LanguageType'];
    classType: ClassType;
}

export interface UniqueMethodValidationOptions<Specifics extends TypirSpecifics, T extends Specifics['LanguageType'] = Specifics['LanguageType']> {
    isMethodDeclaration: (languageNode: Specifics['LanguageType']) => languageNode is T,
    getClassOfMethod: (languageNode: T, methodType: FunctionType) => Specifics['LanguageType'],
    uniqueClassValidator?: UniqueClassValidation<Specifics>,
}
/**
 * Predefined validation to produce errors, if inside a class the same method is declared more than once.
 */
export class UniqueMethodValidation<Specifics extends TypirSpecifics, T extends Specifics['LanguageType'] = Specifics['LanguageType']> implements ValidationRuleLifecycle<Specifics> {
    protected readonly foundDeclarations: Map<string, Array<UniqueMethodValidationEntry<Specifics>>> = new Map();

    protected readonly services: TypirServices<Specifics>;
    /** Determines language nodes which represent declared methods, improves performance. */
    protected readonly isMethodDeclaration: (languageNode: Specifics['LanguageType']) => languageNode is T;
    /** Determines the corresponding language node of the class declaration, so that Typir can infer its ClassType */
    protected readonly getClassOfMethod: (languageNode: T, methodType: FunctionType) => Specifics['LanguageType'];
    protected readonly uniqueClassValidator: UniqueClassValidation<Specifics> | undefined;

    constructor(services: TypirServices<Specifics>, options: UniqueMethodValidationOptions<Specifics, T>) {
        this.services = services;
        this.isMethodDeclaration = options.isMethodDeclaration;
        this.getClassOfMethod = options.getClassOfMethod;
        this.uniqueClassValidator = options.uniqueClassValidator;
    }

    beforeValidation(_languageRoot: Specifics['LanguageType'], _accept: ValidationProblemAcceptor<Specifics>, _typir: TypirServices<Specifics>): void {
        this.foundDeclarations.clear();
    }

    validation(languageNode: Specifics['LanguageType'], _accept: ValidationProblemAcceptor<Specifics>, _typir: TypirServices<Specifics>): void {
        if (this.isMethodDeclaration(languageNode)) { // improves performance, since type inference need to be done only for relevant language nodes
            const methodType = this.services.Inference.inferType(languageNode);
            if (isFunctionType(methodType)) {
                const classDeclaration = this.getClassOfMethod(languageNode, methodType);
                const classType = this.services.Inference.inferType(classDeclaration);
                if (isClassType(classType)) {
                    const key = this.calculateMethodKey(classType, methodType);
                    let entries = this.foundDeclarations.get(key);
                    if (!entries) {
                        entries = [];
                        this.foundDeclarations.set(key, entries);
                    }
                    entries.push({
                        languageNode: languageNode,
                        classType,
                    });
                }
            }
        }
    }

    /**
     * Calculates a key for a method which encodes its unique properties, i.e. duplicate methods have the same key.
     * Additionally, the class of the method needs to be represented in the key as well.
     * This key is used to identify duplicated methods.
     * Override this method to change the properties which make a method unique.
     * @param clas the current class type
     * @param func the current function type
     * @returns a string key
     */
    protected calculateMethodKey(clas: ClassType, func: FunctionType): string {
        return `${clas.getIdentifier()}.${func.functionName}(${func.getInputs().map(param => param.type.getIdentifier())})`;
    }

    afterValidation(_LanguageRoot: Specifics['LanguageType'], accept: ValidationProblemAcceptor<Specifics>, _typir: TypirServices<Specifics>): void {
        for (const [key, methods] of this.foundDeclarations.entries()) {
            if (methods.length >= 2) {
                for (const method of methods) {
                    if (this.uniqueClassValidator?.isClassDuplicated(method.classType)) {
                        // ignore duplicated methods inside duplicated classes
                    } else {
                        this.reportNonUniqueMethod(method, key, accept);
                    }
                }
            }
        }
        this.foundDeclarations.clear();
    }

    protected reportNonUniqueMethod(method: UniqueMethodValidationEntry<Specifics>, key: string, accept: ValidationProblemAcceptor<Specifics>): void {
        accept({
            languageNode: method.languageNode,
            severity: 'error',
            message: `Declared methods need to be unique (${key}).`,
        });
    }
}


export interface NoSuperClassCyclesValidationOptions<Specifics extends TypirSpecifics> {
    /** Helps to filter out declarations of classes in the user AS;
     * this parameter is the reason, why this validation cannot be registered by default by Typir for classes, since this parameter is DSL-specific. */
    isRelevant?: (languageNode: Specifics['LanguageType']) => boolean;
}

/**
 * Predefined validation to produce errors for all those class declarations, whose class type have cycles in their super-classes.
 */
export class NoSuperClassCyclesValidation<Specifics extends TypirSpecifics> implements ValidationRuleLifecycle<Specifics> {
    readonly options: NoSuperClassCyclesValidationOptions<Specifics>;

    constructor(services: TypirServices<Specifics>, options: NoSuperClassCyclesValidationOptions<Specifics>) {
        this.options = { ...options };
    }

    validation(languageNode: Specifics['LanguageType'], accept: ValidationProblemAcceptor<Specifics>, typir: TypirServices<Specifics>): void {
        if (this.options.isRelevant === undefined || this.options.isRelevant(languageNode)) { // improves performance, since type inference need to be done only for relevant language nodes
            const classType = typir.Inference.inferType(languageNode);
            if (isClassType(classType) && classType.isInStateOrLater('Completed')) {
                // check for cycles in sub-type-relationships
                if (classType.hasSubSuperClassCycles()) {
                    this.reportCycle(languageNode, classType, accept);
                }
            }
        }
    }

    protected reportCycle(languageNode: Specifics['LanguageType'], classType: ClassType, accept: ValidationProblemAcceptor<Specifics>): void {
        accept({
            languageNode: languageNode,
            severity: 'error',
            message: `Cycles in super-sub-class-relationships are not allowed: ${classType.getName()}`,
        });
    }
}
