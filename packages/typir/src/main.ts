// eslint-disable-next-line header/header
import { DefaultTypeAssignability, TypeAssignability } from './features/assignability';
import { DefaultTypeConversation, TypeConversation } from './features/conversation';
import { TypeGraph } from './graph/type-graph';
import { ClassKind } from './kinds/class-kind';
import { Kind } from './kinds/kind';
import { PrimitiveKind } from './kinds/primitive-kind';

export class Typir {
    graph: TypeGraph = new TypeGraph();
    kinds: Map<string, Kind> = new Map();

    // manage kinds
    registerKind(kind: Kind): void {
        this.kinds.set(kind.$type, kind);
    }
    getKind(type: string): Kind {
        if (this.kinds.has(type)) {
            return this.kinds.get(type)!;
        }
        throw new Error('missing kind ' + type);
    }

    // features
    assignability: TypeAssignability = new DefaultTypeAssignability(this);
    conversation: TypeConversation = new DefaultTypeConversation(this);

    // TODO some more features
    // inferType(domainElement: any): Type;
    // isSubType(superType: Type, subType: Type): boolean; // 'subTypeOf'
    // isAssignableTo(leftType: Type, rightValue: any): boolean; // or error messages ?
}

/** Some experiments to sketch the use */

// start the type system
const typir = new Typir();

// reuse predefined kinds
const primitiveKind = new PrimitiveKind(typir);
const classKind = new ClassKind(typir, true);

// create some primitive types
const typeInt = primitiveKind.createPrimitiveType('Integer');
const typeString = primitiveKind.createPrimitiveType('String');

// create class type Person with firstName and age properties
const typePerson = classKind.createClassType('Person', { name: 'firstName', type: typeString }, { name: 'age', type: typeInt });
console.log(typePerson.getUserRepresentation());

// automated conversation from int to string
typir.conversation.markAsConvertible(typeInt, typeString);

// is assignable?
console.log(typir.assignability.areAssignable(typeInt, typeInt)); // => true
console.log(typir.assignability.areAssignable(typeInt, typeString)); // => true
console.log(typir.assignability.areAssignable(typeString, typeInt)); // => false
