// eslint-disable-next-line header/header
import { Type, TypeEdge } from '../graph/type-graph';
import { Typir } from '../main';
import { Kind } from './kind';

/**
 * Classes have a name and have fields, consisting of a name and a type.
 */
export class ClassKind extends Kind {
    readonly $type: 'ClassKind';

    constructor(typir: Typir) {
        super(typir);
    }

    createClassType(className: string, ...fields: FieldInformation[]): Type {
        // create the class type
        const classType = new Type(this, className);
        this.typir.graph.addNode(classType);

        // link it to all its "field types"
        for (const fieldInfos of fields) {
            // new edge between class and field with "semantics key"
            const edge = new TypeEdge(classType, fieldInfos.type, CLASS_CONTAINS_FIELDS_TYPE);
            // store the name of the field within the edge
            edge.properties.set(CLASS_CONTAINS_FIELDS_NAME, fieldInfos.name);
            this.typir.graph.addEdge(edge);
        }

        return classType;
    }

    getUserRepresentation(type: Type): string {
        const fields = type.getOutgoingEdges(CLASS_CONTAINS_FIELDS_TYPE).map(edge => `${edge.properties.get(CLASS_CONTAINS_FIELDS_NAME)}: ${edge.to.name}`);
        return `${type.name} { ${fields.join(', ')} }`;
    }
}

export type FieldInformation = {
    name: string;
    type: Type;
}

const CLASS_CONTAINS_FIELDS_TYPE = 'hasField';
const CLASS_CONTAINS_FIELDS_NAME = 'name';
