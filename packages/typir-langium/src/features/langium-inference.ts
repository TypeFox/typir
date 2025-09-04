/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { DefaultTypeInferenceCollector, LanguageKey, TypeInferenceCollector, TypeInferenceRule } from 'typir';
import { TypirLangiumSpecifics } from '../typir-langium.js';

export type LangiumTypeInferenceRules<Specifics extends TypirLangiumSpecifics> = {
    [K in LanguageKey<Specifics>]?: Specifics['LanguageKeys'][K] extends Specifics['LanguageType'] ? TypeInferenceRule<Specifics, Specifics['LanguageKeys'][K]> | Array<TypeInferenceRule<Specifics, Specifics['LanguageKeys'][K]>> : never
} & {
    AstNode?: TypeInferenceRule<Specifics, Specifics['LanguageType']> | Array<TypeInferenceRule<Specifics, Specifics['LanguageType']>>;
}

export interface LangiumTypeInferenceCollector<Specifics extends TypirLangiumSpecifics> extends TypeInferenceCollector<Specifics> {
    addInferenceRulesForAstNodes(rules: LangiumTypeInferenceRules<Specifics>): void;
}

export class DefaultLangiumTypeInferenceCollector<Specifics extends TypirLangiumSpecifics> extends DefaultTypeInferenceCollector<Specifics> implements LangiumTypeInferenceCollector<Specifics> {

    addInferenceRulesForAstNodes(rules: LangiumTypeInferenceRules<Specifics>): void {
        // map this approach for registering inference rules to the key-value approach from core Typir
        for (const [type, ruleCallbacks] of Object.entries(rules)) {
            const languageKey = type === 'AstNode' ? undefined : type; // using 'AstNode' as key is equivalent to specifying no key
            const callbacks = ruleCallbacks as TypeInferenceRule<Specifics, Specifics['LanguageType']> | Array<TypeInferenceRule<Specifics, Specifics['LanguageType']>>;
            if (Array.isArray(callbacks)) {
                for (const callback of callbacks) {
                    this.addInferenceRule(callback, { languageKey });
                }
            } else {
                this.addInferenceRule(callbacks, { languageKey });
            }
        }
    }

}
