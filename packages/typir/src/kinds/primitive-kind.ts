/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { InferConcreteType } from '../features/inference.js';
import { Type } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { TypeConflict, compareForConflict } from '../utils/utils-type-comparison.js';
import { Kind, isKind } from './kind.js';

export const PrimitiveKindName = 'PrimitiveKind';

export class PrimitiveKind implements Kind {
    readonly $name: 'PrimitiveKind';
    readonly typir: Typir;

    constructor(typir: Typir) {
        this.$name = 'PrimitiveKind';
        this.typir = typir;
        this.typir.registerKind(this);
    }

    createPrimitiveType(primitiveName: string, inferenceRule: InferConcreteType | undefined = undefined): Type {
        const primitiveType = new Type(this, primitiveName);
        this.typir.graph.addNode(primitiveType);
        if (inferenceRule) {
            this.typir.inference.addInferenceRule({
                isRuleApplicable(domainElement) {
                    return inferenceRule(domainElement, primitiveName) ? primitiveType : false;
                },
            });
        }
        return primitiveType;
    }

    getUserRepresentation(type: Type): string {
        return type.name;
    }

    isSubType(superType: Type, subType: Type): TypeConflict[] {
        return this.areTypesEqual(superType, subType);
    }

    areTypesEqual(type1: Type, type2: Type): TypeConflict[] {
        if (isPrimitiveKind(type1.kind) && isPrimitiveKind(type2.kind)) {
            const conflicts: TypeConflict[] = [];
            conflicts.push(...compareForConflict(type1.name, type2.name, 'primitive name', 'EQUAL_TYPE'));
            return conflicts;
        }
        throw new Error();
    }
}

export function isPrimitiveKind(kind: unknown): kind is PrimitiveKind {
    return isKind(kind) && kind.$name === PrimitiveKindName;
}
