/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { AbstractAstReflection, AstNode } from 'langium';
import { DefaultLanguageService, LanguageService } from '../../../typir/lib/services/language.js';
import { assertTrue, removeFromArray } from 'typir';

/**
 * The default implementation of the 'LanguageService' for Langium exploits the generated XXXAstReflection,
 * which needs to be given in the constructor.
 */
export class LangiumLanguageService extends DefaultLanguageService implements LanguageService<AstNode> {
    protected readonly reflection: AbstractAstReflection;
    protected superKeys: Map<string, string[]> | undefined = undefined; // key => all its super-keys

    constructor(reflection: AbstractAstReflection | undefined) {
        super();
        if (reflection === undefined) {
            throw new Error("'undefined' is only the default value, insert the generated XXXAstReflection instead");
        }
        assertTrue(reflection !== undefined);
        this.reflection = reflection;
    }

    override getLanguageNodeKey(languageNode: AstNode): string | undefined {
        return languageNode.$type;
    }

    override getAllSubKeys(languageKey: string): string[] {
        const result = this.reflection.getAllSubTypes(languageKey);
        removeFromArray(languageKey, result); // Langium adds the given type in the list of all sub-types, therefore it must be removed here
        return result;
    }

    override getAllSuperKeys(languageKey: string): string[] {
        if (this.superKeys === undefined) {
            // collect all super types (Sets ensure uniqueness of super-keys)
            const map: Map<string, Set<string>> = new Map();
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

}
