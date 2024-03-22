// eslint-disable-next-line header/header
import { InferConcreteType, createInferenceRule } from '../features/inference';
import { Type } from '../graph/type-node';
import { Typir } from '../typir';
import { Kind, isKind } from './kind';

export const PrimitiveKindName = 'PrimitiveKind';

export class PrimitiveKind implements Kind {
    readonly $name: 'PrimitiveKind';
    readonly typir: Typir;

    constructor(typir: Typir) {
        this.typir = typir;
        this.typir.registerKind(this);
    }

    createPrimitiveType(primitiveName: string, inferenceRule: InferConcreteType | undefined = undefined): Type {
        const primitiveType = new Type(this, primitiveName);
        this.typir.graph.addNode(primitiveType);
        if (inferenceRule) {
            this.typir.inference.addInferenceRule(createInferenceRule(inferenceRule, primitiveType));
        }
        return primitiveType;
    }

    getUserRepresentation(type: Type): string {
        return type.name;
    }

    isSubType(superType: Type, subType: Type): boolean {
        return this.areTypesEqual(superType, subType);
    }

    areTypesEqual(type1: Type, type2: Type): boolean {
        return isPrimitiveKind(type1.kind) && isPrimitiveKind(type2.kind) && type1.name === type2.name;
    }
}

export function isPrimitiveKind(kind: unknown): kind is PrimitiveKind {
    return isKind(kind) && kind.$name === PrimitiveKindName;
}
