/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import {
    AstUtils,
    DefaultScopeProvider,
    EMPTY_SCOPE,
    ReferenceInfo,
    Scope,
} from "langium";
import { isClassType } from "typir";
import { TypirLangiumServices } from "typir-langium";
import {
    Class,
    isClass,
    isMemberCall,
    LoxAstType,
    MemberCall,
} from "./generated/ast.js";
import { LoxServices } from "./lox-module.js";
import { getClassChain } from "./lox-utils.js";
// import { isClassType } from './type-system/descriptions.js';
// import { getClassChain, inferType } from './type-system/infer.js';

export class LoxScopeProvider extends DefaultScopeProvider {
    protected readonly typir: TypirLangiumServices<LoxAstType>;

    constructor(services: LoxServices) {
        super(services);
        this.typir = services.typir;
    }

    override getScope(context: ReferenceInfo): Scope {
        // target element of member calls
        if (context.property === "element" && isMemberCall(context.container)) {
            // for now, `this` and `super` simply target the container class type
            if (
                context.reference.$refText === "this" ||
                context.reference.$refText === "super"
            ) {
                const classItem = AstUtils.getContainerOfType(
                    context.container,
                    isClass,
                );
                if (classItem) {
                    return this.scopeClassMembers(classItem);
                } else {
                    return EMPTY_SCOPE;
                }
            }
            const memberCall = context.container as MemberCall;
            const previous = memberCall.previous;
            if (!previous) {
                return super.getScope(context);
            }
            // use Typir to identify the ClassType of the current expression (including variables, fields of nested classes, ...)
            const previousType = this.typir.Inference.inferType(previous);
            if (isClassType(previousType)) {
                return this.scopeClassMembers(
                    previousType.associatedLanguageNode as Class,
                ); // the Class was associated with this ClassType during its creation
            }
            return EMPTY_SCOPE;
        }
        return super.getScope(context);
    }

    private scopeClassMembers(classItem: Class): Scope {
        const allMembers = getClassChain(classItem).flatMap((e) => e.members);
        return this.createScopeForNodes(allMembers);
    }
}
