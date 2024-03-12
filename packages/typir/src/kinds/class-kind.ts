// eslint-disable-next-line header/header
import { Type, TypeEdge } from '../graph/type-graph';
import { Typir } from '../main';
import { NameTypePair, compareNameTypesMap } from '../utils';
import { Kind, isKind } from './kind';

export interface ClassKindOptions {
    structuralTyping: boolean,
}

/**
 * Classes have a name and have fields, consisting of a name and a type.
 *
 * possible Extensions:
 * - sub/super class TODO (with options to control that, multiple super classes! getFields with Option to get fields of super classes as well)
 */
export class ClassKind implements Kind {
    readonly $type: 'ClassKind';
    readonly typir: Typir;
    readonly options: ClassKindOptions;

    constructor(typir: Typir, options: ClassKindOptions) {
        this.typir = typir;
        this.typir.registerKind(this);
        this.options = options;
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

    getUserRepresentation(type: Type): string {
        const fields: string[] = [];
        for (const field of this.getFields(type).entries()) {
            fields.push(`${field[0]}: ${field[1].name}`);
        }
        return `${type.name} { ${fields.join(', ')} }`;
    }

    isSubType(superType: Type, subType: Type): boolean {
        if (isClassKind(superType.kind) && isClassKind(subType.kind)) {
            if (this.options.structuralTyping) {
                // for structural typing:
                return compareNameTypesMap(this.getFields(superType), this.getFields(subType),
                    (superr, sub) => this.typir.assignability.isAssignable(sub, superr));
            } else {
                // for nominal typing:
                return superType.name === subType.name;
            }
        }
        return false;
    }

    areTypesEqual(type1: Type, type2: Type): boolean {
        if (isClassKind(type1.kind) && isClassKind(type2.kind)) {
            if (this.options.structuralTyping) {
                // for structural typing:
                return compareNameTypesMap(this.getFields(type1), this.getFields(type2),
                    (t1, t2) => this.typir.equality.areTypesEqual(t1, t2));
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
