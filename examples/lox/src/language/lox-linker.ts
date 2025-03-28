/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { AstNodeDescription, DefaultLinker, LinkingError, ReferenceInfo } from 'langium';
import { LangiumServicesForTypirBinding } from 'typir-langium';
import { isType } from '../../../../packages/typir/lib/graph/type-node.js';
import { isClass, isFunctionDeclaration, isMemberCall, isMethodMember, LoxAstType } from './generated/ast.js';
import { LoxServices } from './lox-module.js';

export class LoxLinker extends DefaultLinker {
    protected readonly typir: LangiumServicesForTypirBinding<LoxAstType>;

    constructor(services: LoxServices) {
        super(services);
        this.typir = services.typir;
    }

    override getCandidate(refInfo: ReferenceInfo): AstNodeDescription | LinkingError {
        const container = refInfo.container;
        if (isMemberCall(container) && container.explicitOperationCall) {
            // handle overloaded functions/methods
            const scope = this.scopeProvider.getScope(refInfo);
            const calledDescriptions = scope.getAllElements().filter(d => d.name === refInfo.reference.$refText).toArray(); // same name
            if (calledDescriptions.length === 1) {
                return calledDescriptions[0]; // no overloaded functions/methods
            } if (calledDescriptions.length >= 2) {
                // in case of overloaded functions/methods, do type inference for given arguments
                const argumentTypes = container.arguments.map(arg => this.typir.Inference.inferType(arg)).filter(isType);
                if (argumentTypes.length === container.arguments.length) { // for all given arguments, a type is inferred
                    for (const calledDescription of calledDescriptions) {
                        const called = this.loadAstNode(calledDescription);
                        if (isClass(called)) {
                            // special case: call of the constructur, without any arguments/parameters
                            return calledDescription; // there is only one constructor without any parameters
                        }
                        if ((isMethodMember(called) || isFunctionDeclaration(called)) && called.parameters.length === container.arguments.length) { // same number of arguments
                            // infer expected types of parameters
                            const parameterTypes = called.parameters.map(p => this.typir.Inference.inferType(p)).filter(isType);
                            if (parameterTypes.length === called.parameters.length) { // for all parameters, a type is inferred
                                if (argumentTypes.every((arg, index) => this.typir.Assignability.isAssignable(arg, parameterTypes[index]))) {
                                    return calledDescription;
                                }
                            }
                        }
                    }
                }
                // no matching method is found, return the first found method => linking works + validation issues regarding the wrong parameter values can be shown!
                return calledDescriptions[0];

                // the following approach does not work, since the container's cross-references are required for type inference, but they are not yet resolved
                // const type = this.typir.Inference.inferType(container);
                // if (isFunctionType(type)) {
                //     return type.associatedLanguageNode
                // }
            }
            return this.createLinkingError(refInfo);
        }
        return super.getCandidate(refInfo);
    }
}
