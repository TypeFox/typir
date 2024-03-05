// eslint-disable-next-line header/header
import { Type, TypeEdge } from '../graph/type-graph';
import { Typir } from '../main';
import { Kind } from './kind';

/**
 * Classes have a name and have fields, consisting of a name and a type.
 * TODO sub/super class
 */
export class ClassKind extends Kind {
    readonly $type: 'ClassKind';
    readonly structuralTyping: boolean;

    constructor(typir: Typir, structuralTyping: boolean) {
        super(typir);
        this.structuralTyping = structuralTyping;
    }

    createClassType(className: string, ...fields: FieldInformation[]): Type {
        // create the class type
        const classType = new Type(this, className);
        this.typir.graph.addNode(classType);

        // link it to all its "field types"
        for (const fieldInfos of fields) {
            // new edge between class and field with "semantics key"
            const edge = new TypeEdge(classType, fieldInfos.type, FIELD_TYPE);
            // store the name of the field within the edge
            edge.properties.set(FIELD_NAME, fieldInfos.name);
            this.typir.graph.addEdge(edge);
        }

        return classType;
    }

    getUserRepresentation(type: Type): string {
        const fields: string[] = [];
        for (const field of this.getFields(type).entries()) {
            fields.push(`${field[0]}: ${field[1].name}`);
        }
        return `${type.name} { ${fields.join(', ')} }`;
    }

    isAssignable(left: Type, right: Type): boolean {
        if (this.structuralTyping) {
            // for structural typing:
            const leftFields = this.getFields(left);
            const rightFields = this.getFields(right);
            if (leftFields.size !== rightFields.size) {
                return false;
            }
            for (const entry of leftFields.entries()) {
                const leftType = entry[1];
                const rightType = rightFields.get(entry[0]);
                // TODO prevent loops during this recursion
                if (rightType === undefined || this.typir.assignability.isAssignable(leftType, rightType) === false) {
                    return false;
                }
            }
            return true;
        } else {
            // for nominal typing:
            return left.name === right.name;
        }
    }

    protected getFields(classType: Type): Map<string, Type> {
        const result = new Map();
        classType.getOutgoingEdges(FIELD_TYPE).forEach(edge => {
            const name = edge.properties.get(FIELD_NAME);
            const type = edge.to;
            if (result.has(name)) {
                throw new Error('multiple fields with same name ' + name);
            }
            result.set(name, type);
        });
        return result;
    }
}

export type FieldInformation = {
    name: string;
    type: Type;
}

const FIELD_TYPE = 'hasField';
const FIELD_NAME = 'name';
