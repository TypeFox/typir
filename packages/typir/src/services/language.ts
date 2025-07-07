/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

/**
 * This services provides some static information about the language/DSL, for which the type system is created.
 *
 * The main idea for this services is to improve the performance of some other services (mainly validation and type inference)
 * by introducing the concept of "language keys" for language nodes.
 * If rules for validation and type inference are associated to a language key,
 * these rules are applied only to those language nodes which have this language key, not to all language nodes.
 * It is possible to associate rules to multiple language keys.
 * Rules which are associated to no language key, are applied to all language nodes.
 *
 * Language keys are represented by string values and might by, depending on the DSL implementation/language workbench,
 * class names or $type-property-information of the language node implementations.
 *
 * Language keys might have sub/super language keys ("sub-type relationship of language keys").
 */
export interface LanguageService<LanguageType> {
    /**
     * Returns the language key for a given language node
     * @param languageNode the given language node
     * @returns the language key or 'undefined', if there is no language key for the given language node
     */
    getLanguageNodeKey(languageNode: LanguageType): string | undefined;

    /**
     * Returns all keys, which are direct or indirect sub-keys of the given language key.
     * @param languageKey the given language key
     * @returns the list does not contain the given language key itself
     */
    getAllSubKeys(languageKey: string): string[];

    /**
     * Returns all keys, which are direct or indirect super-keys of the given language key.
     * @param languageKey the given language key
     * @returns the list does not contain the given language key itself
     */
    getAllSuperKeys(languageKey: string): string[];
}


/**
 * This default implementation provides no information about the current language.
 */
export class DefaultLanguageService<LanguageType> implements LanguageService<LanguageType> {

    getLanguageNodeKey(_languageNode: LanguageType): string | undefined {
        return undefined;
    }

    getAllSubKeys(_languageKey: string): string[] {
        return [];
    }

    getAllSuperKeys(_languageKey: string): string[] {
        return [];
    }

}
