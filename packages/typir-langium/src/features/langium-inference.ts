/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { AstNode } from 'langium';
import { DefaultTypeInferenceCollector, TypeInferenceCollector, TypeInferenceRule } from 'typir';
import { LangiumAstTypes } from '../utils/typir-langium-utils.js';

export type LangiumTypeInferenceRules<T extends LangiumAstTypes> = {
    [K in keyof T]?: T[K] extends AstNode ? TypeInferenceRule<AstNode, T[K]> | Array<TypeInferenceRule<AstNode, T[K]>> : never
} & {
    AstNode?: TypeInferenceRule<AstNode, AstNode> | Array<TypeInferenceRule<AstNode, AstNode>>;
}

export interface LangiumTypeInferenceCollector<AstTypes extends LangiumAstTypes> extends TypeInferenceCollector<AstNode> {
    addInferenceRulesForAstNodes(rules: LangiumTypeInferenceRules<AstTypes>): void;
}

export class DefaultLangiumTypeInferenceCollector<AstTypes extends LangiumAstTypes> extends DefaultTypeInferenceCollector<AstNode> implements LangiumTypeInferenceCollector<AstTypes> {

    addInferenceRulesForAstNodes(rules: LangiumTypeInferenceRules<AstTypes>): void {
        // map this approach for registering inference rules to the key-value approach from core Typir
        for (const [type, ruleCallbacks] of Object.entries(rules)) {
            const languageKey = type === 'AstNode' ? undefined : type; // using 'AstNode' as key is equivalent to specifying no key
            const callbacks = ruleCallbacks as TypeInferenceRule<AstNode> | Array<TypeInferenceRule<AstNode>>;
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
