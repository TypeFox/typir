// eslint-disable-next-line header/header
import { Type, TypeEdge } from '../graph/type-graph';
import { Typir } from '../main';
import { NameTypePair, compareNameTypesMap } from '../utils';
import { Kind, isKind } from './kind';

/**
 * Classes have a name and have fields, consisting of a name and a type.
 *
 * possible Extensions:
 * - sub/super class
 */
export class ClassKind extends Kind {
    readonly $type: 'ClassKind';
    readonly structuralTyping: boolean;

    constructor(typir: Typir, structuralTyping: boolean) {
        super(typir);
        this.structuralTyping = structuralTyping;
    }

    createClassType(className: string, ...fields: NameTypePair[]): Type {
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

    override getUserRepresentation(type: Type): string {
        const fields: string[] = [];
        for (const field of this.getFields(type).entries()) {
            fields.push(`${field[0]}: ${field[1].name}`);
        }
        return `${type.name} { ${fields.join(', ')} }`;
    }

    override isAssignable(source: Type, target: Type): boolean {
        if (isClassKind(source.kind) && isClassKind(target.kind)) {
            if (this.structuralTyping) {
                // for structural typing:
                return compareNameTypesMap(this.getFields(source), this.getFields(target),
                    (s, t) => this.typir.assignability.isAssignable(s, t));
            } else {
                // for nominal typing:
                return source.name === target.name;
            }
        }
        return false;
    }

    override areTypesEqual(type1: Type, type2: Type): boolean {
        if (isClassKind(type1.kind) && isClassKind(type2.kind)) {
            if (this.structuralTyping) {
                // for structural typing:
                return compareNameTypesMap(this.getFields(type1), this.getFields(type2),
                    (s, t) => this.typir.equality.areTypesEqual(s, t));
            } else {
                // for nominal typing:
                return type1.name === type2.name;
            }
        }
        return false;
    }

    getFields(classType: Type): Map<string, Type> {
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

const FIELD_TYPE = 'hasField';
const FIELD_NAME = 'name';

export function isClassKind(kind: unknown): kind is ClassKind {
    return isKind(kind) && kind.$type === 'ClassKind';
}
