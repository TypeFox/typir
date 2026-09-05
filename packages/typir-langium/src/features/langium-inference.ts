/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { DefaultTypeInferenceCollector, InferenceRulesForLanguageKeys, TypeInferenceRule } from 'typir';
import { TypirLangiumSpecifics } from '../typir-langium.js';

export class DefaultLangiumTypeInferenceCollector<Specifics extends TypirLangiumSpecifics> extends DefaultTypeInferenceCollector<Specifics> {

    override addInferenceRulesForLanguageNodes(rules: InferenceRulesForLanguageKeys<Specifics>): void {
        // map this approach for registering inference rules to the key-value approach from core Typir
        for (const [$type, inferenceRules] of Object.entries(rules)) {
            const languageKey = $type === 'AstNode' ? undefined : $type; // using 'AstNode' as key is equivalent to specifying no key
            const callbacks = inferenceRules as TypeInferenceRule<Specifics, Specifics['LanguageType']> | Array<TypeInferenceRule<Specifics, Specifics['LanguageType']>>;
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
