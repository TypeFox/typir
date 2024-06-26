/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { assertUnreachable } from 'langium';
import { Type, isType, typedKey } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { TypirProblem } from '../utils/utils-type-comparison.js';
import { Kind } from './kind.js';
import { TypeEdge } from '../graph/type-edge.js';

/*
function inferType(_node: AstNode): Type { return undefined!; }
const classNode: NamedAstNode & {
    superType: AstNode|undefined,
    interfaces: AstNode[],
    fields: NamedAstNode[]
} = undefined!;
export interface ClassTypeOptions {
    name: string,
    children: {
        superType: () => Type|undefined,
        interfaces: () => Type[],
        members: () => Array<[string, Type]>,
    }
}
function createComposite(_options: ClassTypeOptions): void {}
createComposite({
    name: classNode.name,
    children: {
        superType: () => classNode.superType ? inferType(classNode.superType) : undefined,
        interfaces: () => classNode.interfaces.map(inferType),
        members: () => classNode.fields.map(f => [f.name, inferType(f)] as const),
    }
});*/

type ChildNameOrIndex = string | number;
type ChildrenTypeKind = 'single-type' | 'multiple-types' | 'named-types';
type ChildrenType = Type | Type[] | Array<[ChildNameOrIndex, Type]>;
type CompositeChildrenBase = Record<string, ChildrenType>;
type CompositeChildrenFactories<TChildren extends CompositeChildrenBase> = {
    [C in keyof TChildren]: () => TChildren[C];
};
type TypeWithCompositeChildren<TChildren extends CompositeChildrenBase> = {
    type: Type;
    children: TChildren;
};
type PrepareCompositeTypeDetails<TChildren extends CompositeChildrenBase> = {
    className: string;
    childrenFactories: CompositeChildrenFactories<TChildren>;
    isSubType: (superType: TypeWithCompositeChildren<TChildren>, subType: TypeWithCompositeChildren<TChildren>) => boolean;
};

const EDGE_CHILD = 'COMPOSITE_CHILD';
const EDGE_CHILD_ROLE = typedKey<ChildrenTypeKind>('ROLE');
const EDGE_CHILD_NAME = typedKey<string>('NAME');
const EDGE_CHILD_INDEX = typedKey<number>('INDEX');
const NODE_TYPE_RESOLVE = typedKey<() => void>('RESOLVE');
function NODE_TYPE_CHILDREN<TChildren>() { return typedKey<() => TChildren>('CHILDREN'); }
function NODE_TYPE_IS_SUBTYPE<TChildren extends CompositeChildrenBase>() { return typedKey<(superType: TypeWithCompositeChildren<TChildren>, subType: TypeWithCompositeChildren<TChildren>) => boolean>('IS_SUBTYPE'); }
export class CompositeKind<TChildren extends CompositeChildrenBase> implements Kind {
    readonly $name: string;
    readonly typir: Typir;

    constructor(typir: Typir, name: string) {
        this.$name = name;
        this.typir = typir;
        this.typir.registerKind(this);
    }

    protected createCompositeType({ className, childrenFactories: children, isSubType }: PrepareCompositeTypeDetails<TChildren>): Type {
        const classType = new Type(this, className);
        this.typir.graph.addNode(classType);

        type RoleNameTypeTuple = readonly [keyof TChildren, ChildNameOrIndex | undefined, Type];
        type RoleNameToChildKind = Record<keyof TChildren, ChildrenTypeKind>;

        let roles: RoleNameToChildKind = undefined!;

        function* bakeChildren(): Generator<RoleNameTypeTuple> {
            roles = {} as RoleNameToChildKind;
            for (const [role, factory] of Object.entries(children)) {
                const roleName = role as keyof TChildren;
                const typedFactory = factory as () => ChildrenType;
                const child = typedFactory();
                if (isType(child)) {
                    const type = child;
                    roles![roleName] = 'single-type';
                    yield ([roleName, undefined, type] as const);
                } else if (Array.isArray(child)) {
                    if (isType(child[0])) {
                        const types = child as Type[];
                        roles![roleName] = 'multiple-types';
                        for (const type of types) {
                            yield ([roleName, undefined, type] as const);
                        }
                    } else {
                        const namedTypes = child as Array<[ChildNameOrIndex, Type]>;
                        roles![roleName] = 'named-types';
                        for (const [nameOrIndex, type] of namedTypes) {
                            yield ([roleName, nameOrIndex, type] as const);
                        }
                    }
                } else {
                    assertUnreachable(child);
                }
            }
        }

        const resolveChildren = () => {
            for (const [role, nameOrIndex, type] of bakeChildren()) {
                const edge = new TypeEdge(classType, type, EDGE_CHILD);
                edge.properties.set(EDGE_CHILD_ROLE, role);
                if (typeof nameOrIndex === 'string') {
                    edge.properties.set(EDGE_CHILD_NAME, nameOrIndex);
                } else if (typeof nameOrIndex === 'number') {
                    edge.properties.set(EDGE_CHILD_INDEX, nameOrIndex);
                }
                this.typir.graph.addEdge(edge);
            }
        };

        function getChildren(): TChildren {
            const properties = {} as TChildren;
            const edges = classType.getOutgoingEdges(EDGE_CHILD);
            for (const [role, childTypeKind] of Object.entries(roles!)) {
                const roleName = role as keyof TChildren;
                switch (childTypeKind) {
                    case 'single-type':
                        properties[roleName] = edges.find(e => e.properties.get(EDGE_CHILD_ROLE) === roleName)!.to as TChildren[typeof roleName];
                        break;
                    case 'multiple-types':
                        properties[roleName] = edges.filter(e => e.properties.get(EDGE_CHILD_ROLE) === roleName)
                            .map(e => e.to) as TChildren[typeof roleName];
                        break;
                    case 'named-types':
                        properties[roleName] = edges.filter(e => e.properties.get(EDGE_CHILD_ROLE) === roleName)
                            .map(e => [e.properties.get(EDGE_CHILD_NAME) || e.properties.get(EDGE_CHILD_INDEX), e.to]) as TChildren[typeof roleName];
                        break;
                }
            }
            return properties;
        }

        classType.properties.set(NODE_TYPE_IS_SUBTYPE<TChildren>(), isSubType);
        classType.properties.set(NODE_TYPE_RESOLVE, resolveChildren);
        classType.properties.set(NODE_TYPE_CHILDREN<TChildren>(), getChildren);

        return classType;
    }

    getUserRepresentation(_type: Type): string {
        return '';
    }

    isSubType(superType: Type, subType: Type): TypirProblem[] {
        if (subType.kind !== this || superType.kind !== this) {
            throw new Error();
        }
        const isSubType = subType.properties.get(NODE_TYPE_IS_SUBTYPE<TChildren>());
        const sub: TypeWithCompositeChildren<TChildren> = {
            type: subType,
            children: subType.properties.get(NODE_TYPE_CHILDREN<TChildren>())()
        };
        const sup: TypeWithCompositeChildren<TChildren> = {
            type: superType,
            children: superType.properties.get(NODE_TYPE_CHILDREN<TChildren>())()
        };
        if (isSubType(sup, sub)) {
            return [];
        }
        return [{
            superType: superType,
            subType: subType,
            subProblems: []
        }];
    }

    areTypesEqual(_type1: Type, _type2: Type): TypirProblem[] {
        return [];
    }
}
