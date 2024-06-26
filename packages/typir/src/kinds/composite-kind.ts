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
import { assertTrue } from '../utils/utils.js';

type ChildrenTypeKind = 'single-type' | 'multiple-types' | 'named-types' | 'indexed-types';
export type NameWithType = [string, Type];
export type IndexWithType = [number, Type];
type ChildrenType = Type | Type[] | NameWithType[] | IndexWithType[];
type CompositeChildrenBase = Record<string, ChildrenType>;
type CompositeChildrenFactories<TChildren extends CompositeChildrenBase> = {
    [C in keyof TChildren]: () => TChildren[C];
};
type PrepareCompositeTypeDetails<TChildren extends CompositeChildrenBase> = {
    className: string;
    childrenFactories: CompositeChildrenFactories<TChildren>;
};

const EDGE_CHILD = 'COMPOSITE_CHILD';
const EDGE_CHILD_ROLE = typedKey<string>('ROLE');
const EDGE_CHILD_NAME = typedKey<string>('NAME');
const EDGE_CHILD_INDEX = typedKey<number>('INDEX');

export class CompositeKind<TChildren extends CompositeChildrenBase> implements Kind {
    public readonly NODE_TYPE_CHILDREN = typedKey<() => TChildren>('CHILDREN');
    public readonly NODE_TYPE_RESOLVE = typedKey<() => void>('RESOLVE');

    readonly $name: string;
    readonly typir: Typir;
    readonly internalIsSubType: (superType: Type, subType: Type) => boolean;

    constructor(typir: Typir, name: string, isSubType: (superType: Type, subType: Type) => boolean) {
        this.$name = name;
        this.typir = typir;
        this.internalIsSubType = isSubType;
        this.typir.registerKind(this);
    }

    public createType({ className, childrenFactories: children }: PrepareCompositeTypeDetails<TChildren>): Type {
        const classType = new Type(this, className);
        this.typir.graph.addNode(classType);

        type RoleNameTypeTuple = readonly [keyof TChildren, number | string | undefined, Type];
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
                        assertTrue(Array.isArray(child[0]));
                        if(typeof child[0][0] === 'number') {
                            const indexedTypes = child as IndexWithType[];
                            roles![roleName] = 'indexed-types';
                            for (const [index, type] of indexedTypes) {
                                yield ([roleName, index, type] as const);
                            }
                        } else {
                            const namedTypes = child as NameWithType[];
                            roles![roleName] = 'named-types';
                            for (const [name, type] of namedTypes) {
                                yield ([roleName, name, type] as const);
                            }
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
                            .map(e => [e.properties.get(EDGE_CHILD_NAME), e.to]) as TChildren[typeof roleName];
                        break;
                    case 'indexed-types':
                        properties[roleName] = edges.filter(e => e.properties.get(EDGE_CHILD_ROLE) === roleName)
                            .map(e => [e.properties.get(EDGE_CHILD_INDEX), e.to]) as TChildren[typeof roleName];
                        break;
                }
            }
            return properties;
        }

        classType.properties.set(this.NODE_TYPE_RESOLVE, resolveChildren);
        classType.properties.set(this.NODE_TYPE_CHILDREN, getChildren);

        return classType;
    }

    getUserRepresentation(_type: Type): string {
        return '';
    }

    isSubType(superType: Type, subType: Type): TypirProblem[] {
        if (subType.kind !== this || superType.kind !== this) {
            throw new Error();
        }
        if (this.internalIsSubType(superType, subType)) {
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
