/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/
import { isClassType, isFunctionType, isNilType, TypeDescription } from "./descriptions.js";
import { getClassChain } from "./infer.js";

export function isAssignable(from: TypeDescription, to: TypeDescription): boolean {
    if (isClassType(from)) {
        if (!isClassType(to)) {
            return false;
        }
        const fromLit = from.literal;
        const fromChain = getClassChain(fromLit);
        const toClass = to.literal;
        for (const fromClass of fromChain) {
            if (fromClass === toClass) {
                return true;
            }
        }
        return false;
    }
    if (isNilType(from)) {
        return isClassType(to);
    }
    if (isFunctionType(from)) {
        if (!isFunctionType(to)) {
            return false;
        }
        if (!isAssignable(from.returnType, to.returnType)) {
            return false;
        }
        if (from.parameters.length !== to.parameters.length) {
            return false;
        }
        for (let i = 0; i < from.parameters.length; i++) {
            const fromParam = from.parameters[i];
            const toParam = to.parameters[i];
            if (!isAssignable(fromParam.type, toParam.type)) {
                return false;
            }
        }
        return true;
    }
    return from.$type === to.$type;
}
