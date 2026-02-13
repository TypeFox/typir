/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { AbstractAstReflection, isAstNode } from 'langium';
import { DefaultLanguageService, LanguageKey, LanguageService, removeFromArray } from 'typir';
import { TypirLangiumSpecifics } from '../typir-langium.js';

/**
 * The default implementation of the 'LanguageService' for Langium exploits the generated XXXAstReflection,
 * which needs to be given in the constructor.
 */
export class LangiumLanguageService<Specifics extends TypirLangiumSpecifics> extends DefaultLanguageService<Specifics> implements LanguageService<Specifics> {
    protected readonly reflection: AbstractAstReflection;
    protected superKeys: Map<LanguageKey<Specifics>, Array<LanguageKey<Specifics>>> | undefined = undefined; // key => all its super-keys

    constructor(reflection: AbstractAstReflection) {
        super();
        this.reflection = reflection;
    }

    override getLanguageNodeKey(languageNode: Specifics['LanguageType']): LanguageKey<Specifics> {
        return languageNode.$type;
    }

    override getAllSubKeys(languageKey: LanguageKey<Specifics>): Array<LanguageKey<Specifics>> {
        const result = this.reflection.getAllSubTypes(languageKey as string);
        removeFromArray(languageKey, result); // Langium adds the given type in the list of all sub-types, therefore it must be removed here
        return result;
    }

    override getAllSuperKeys(languageKey: LanguageKey<Specifics>): Array<LanguageKey<Specifics>> {
        if (this.superKeys === undefined) {
            // collect all super types (Sets ensure uniqueness of super-keys)
            const map: Map<LanguageKey<Specifics>, Set<LanguageKey<Specifics>>> = new Map();
            for (const superKey of this.reflection.getAllTypes()) {
                for (const subKey of this.getAllSubKeys(superKey)) {
                    let entries = map.get(subKey);
                    if (entries === undefined) {
                        entries = new Set();
                        map.set(subKey, entries);
                    }
                    entries.add(superKey);
                }
            }
            // use an array for super-keys in the final result
            this.superKeys = new Map();
            for (const [subKey, superKeysSet] of map.entries()) {
                this.superKeys.set(subKey, Array.from(superKeysSet));
            }
        }
        return this.superKeys.get(languageKey) ?? [];
    }

    override isLanguageNode(node: unknown): node is Specifics['LanguageType'] {
        return isAstNode(node);
    }

}
