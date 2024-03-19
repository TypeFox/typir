// eslint-disable-next-line header/header
import { Type, TypeEdge } from '../graph/type-graph';
import { Typir } from '../typir';
import { NameTypePair, compareNameTypesMap } from '../utils';
import { Kind, isKind } from './kind';

export interface ClassKindOptions {
    structuralTyping: boolean,
    maximumNumberOfSuperClasses: number, // values < 0 indicate an arbitrary number of super classes
    subtypeFieldChecking: 'EQUAL_TYPE' | 'ASSIGNABLE_TYPE' | 'SUB_TYPE',
}

// TODO: Do Fields need multiplicities?

/**
 * Classes have a name and have an arbitrary number of fields, consisting of a name and a type, and an arbitrary number of super-classes.
 */
export class ClassKind implements Kind {
    readonly $name: 'ClassKind';
    readonly typir: Typir;
    readonly options: ClassKindOptions;

    constructor(typir: Typir, options: ClassKindOptions) {
        this.typir = typir;
        this.typir.registerKind(this);
        this.options = options;
    }

    createClassType(className: string, superClasses: Type[], ...fields: NameTypePair[]): Type {
        // create the class type
        const classType = new Type(this, className);
        this.typir.graph.addNode(classType);

        // FIELDS
        // link it to all its "field types"
        for (const fieldInfos of fields) {
            // new edge between class and field with "semantics key"
            const edge = new TypeEdge(classType, fieldInfos.type, FIELD_TYPE);
            // store the name of the field within the edge
            edge.properties.set(FIELD_NAME, fieldInfos.name);
            this.typir.graph.addEdge(edge);
        }
        // check collisions of field names
        if (this.getFields(classType, false).size !== fields.length) {
            throw new Error('field names must be unique!');
        }

        // SUB-SUPER-CLASSES
        // check number of allowed super classes
        if (this.options.maximumNumberOfSuperClasses >= 0) {
            if (this.options.maximumNumberOfSuperClasses < superClasses.length) {
                throw new Error(`Only ${this.options.maximumNumberOfSuperClasses} super-classes are allowed.`);
            }
        }
        // check cycles
        for (const superClass of superClasses) {
            if (this.getAllSuperClasses(superClass, true).has(classType)) {
                throw new Error('Circle in super-sub-class-relationships are not allowed.');
            }
        }
        // link the new class to all its super classes
        for (const superr of superClasses) {
            if (superr.kind.$name !== classType.kind.$name) {
                throw new Error();
            }
            const edge = new TypeEdge(classType, superr, SUPER_CLASS);
            this.typir.graph.addEdge(edge);
        }

        return classType;
    }

    getUserRepresentation(type: Type): string {
        const fields: string[] = [];
        for (const field of this.getFields(type, false).entries()) {
            fields.push(`${field[0]}: ${field[1].name}`);
        }
        return `${type.name} { ${fields.join(', ')} }`;
    }

    isSubType(superType: Type, subType: Type): boolean {
        if (isClassKind(superType.kind) && isClassKind(subType.kind)) {
            if (this.options.structuralTyping) {
                // for structural typing, the sub type needs to have all fields of the super type with assignable types (including fields of all super classes):
                const subFields = this.getFields(subType, true);
                for (const [superFieldName, superFieldType] of this.getFields(superType, true)) {
                    const subFieldType = subFields.get(superFieldName);
                    if (subFieldType && (
                        (this.options.subtypeFieldChecking === 'ASSIGNABLE_TYPE' && this.typir.assignability.isAssignable(subFieldType, superFieldType)) ||
                        (this.options.subtypeFieldChecking === 'EQUAL_TYPE' && this.typir.equality.areTypesEqual(subFieldType, superFieldType)) ||
                        (this.options.subtypeFieldChecking === 'SUB_TYPE' && this.typir.subtype.isSubType(superFieldType, subFieldType))
                    )) {
                        continue; // this field is fine
                    }
                    return false;
                }
                return true;
            } else {
                // for nominal typing (super classes don't matter):
                return superType.name === subType.name;
            }
        }
        return false;
    }

    areTypesEqual(type1: Type, type2: Type): boolean {
        if (isClassKind(type1.kind) && isClassKind(type2.kind)) {
            if (this.options.structuralTyping) {
                // for structural typing:
                return compareNameTypesMap(this.getFields(type1, true), this.getFields(type2, true),
                    (t1, t2) => this.typir.equality.areTypesEqual(t1, t2));
            } else {
                // for nominal typing:
                return type1.name === type2.name;
            }
        }
        return false;
    }

    getDeclaredSuperClasses(classType: Type): Type[] {
        return classType.getOutgoingEdges(SUPER_CLASS).map(edge => edge.to);
    }

    getDeclaredSubClasses(classType: Type): Type[] {
        return classType.getIncomingEdges(SUPER_CLASS).map(edge => edge.from);
    }

    getAllSuperClasses(classType: Type, includingGivenClass: boolean = false): Set<Type> {
        const result = new Set<Type>();
        if (includingGivenClass) {
            result.add(classType);
        }
        const toadd = this.getDeclaredSuperClasses(classType);
        while (toadd.length >= 1) {
            const current = toadd.pop()!;
            if (result.has(current)) {
                // nothing to do
            } else {
                // found a new super class
                result.add(current);
                // ... and add its super classes as well
                toadd.push(...this.getDeclaredSuperClasses(current));
            }
        }
        return result;
    }

    getAllSubClasses(classType: Type, includingGivenClass: boolean = false): Set<Type> {
        const result = new Set<Type>();
        if (includingGivenClass) {
            result.add(classType);
        }
        const toadd = this.getDeclaredSubClasses(classType);
        while (toadd.length >= 1) {
            const current = toadd.pop()!;
            if (result.has(current)) {
                // nothing to do
            } else {
                // found a new sub class
                result.add(current);
                // ... and add its sub classes as well
                toadd.push(...this.getDeclaredSubClasses(current));
            }
        }
        return result;
    }

    getFields(classType: Type, withSuperClassesFields: boolean): Map<string, Type> {
        // in case of conflicting field names, the type of the sub-class takes precedence!
        const result = new Map();
        // fields of super classes
        if (withSuperClassesFields) {
            for (const superClass of this.getDeclaredSuperClasses(classType)) {
                for (const [superName, superType] of this.getFields(superClass, true)) {
                    result.set(superName, superType);
                }
            }
        }
        // own fields
        classType.getOutgoingEdges(FIELD_TYPE).forEach(edge => {
            const name = edge.properties.get(FIELD_NAME);
            const type = edge.to;
            result.set(name, type);
        });
        return result;
    }
}

const FIELD_TYPE = 'hasField';
const FIELD_NAME = 'name';
const SUPER_CLASS = 'isSuperClass';

export function isClassKind(kind: unknown): kind is ClassKind {
    return isKind(kind) && kind.$name === 'ClassKind';
}
