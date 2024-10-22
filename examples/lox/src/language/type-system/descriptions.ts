/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { AstNode } from 'langium';
import { BooleanLiteral, Class, NumberLiteral, StringLiteral } from '../generated/ast.js';

export type TypeDescription =
    | NilTypeDescription
    | VoidTypeDescription
    | BooleanTypeDescription
    | StringTypeDescription
    | NumberTypeDescription
    | FunctionTypeDescription
    | ClassTypeDescription
    | ErrorType;

export interface NilTypeDescription {
    readonly $type: 'nil'
}

export function createNilType(): NilTypeDescription {
    return {
        $type: 'nil'
    };
}

export function isNilType(item: TypeDescription): item is NilTypeDescription {
    return item.$type === 'nil';
}

export interface VoidTypeDescription {
    readonly $type: 'void'
}

export function createVoidType(): VoidTypeDescription {
    return {
        $type: 'void'
    };
}

export function isVoidType(item: TypeDescription): item is VoidTypeDescription {
    return item.$type === 'void';
}

export interface BooleanTypeDescription {
    readonly $type: 'boolean'
    readonly literal?: BooleanLiteral
}

export function createBooleanType(literal?: BooleanLiteral): BooleanTypeDescription {
    return {
        $type: 'boolean',
        literal
    };
}

export function isBooleanType(item: TypeDescription): item is BooleanTypeDescription {
    return item.$type === 'boolean';
}

export interface StringTypeDescription {
    readonly $type: 'string'
    readonly literal?: StringLiteral
}

export function createStringType(literal?: StringLiteral): StringTypeDescription {
    return {
        $type: 'string',
        literal
    };
}

export function isStringType(item: TypeDescription): item is StringTypeDescription {
    return item.$type === 'string';
}

export interface NumberTypeDescription {
    readonly $type: 'number',
    readonly literal?: NumberLiteral
}

export function createNumberType(literal?: NumberLiteral): NumberTypeDescription {
    return {
        $type: 'number',
        literal
    };
}

export function isNumberType(item: TypeDescription): item is NumberTypeDescription {
    return item.$type === 'number';
}

export interface FunctionTypeDescription {
    readonly $type: 'function'
    readonly returnType: TypeDescription
    readonly parameters: FunctionParameter[]
}

export interface FunctionParameter {
    name: string
    type: TypeDescription
}

export function createFunctionType(returnType: TypeDescription, parameters: FunctionParameter[]): FunctionTypeDescription {
    return {
        $type: 'function',
        parameters,
        returnType
    };
}

export function isFunctionType(item: TypeDescription): item is FunctionTypeDescription {
    return item.$type === 'function';
}

export interface ClassTypeDescription {
    readonly $type: 'class'
    readonly literal: Class
}

export function createClassType(literal: Class): ClassTypeDescription {
    return {
        $type: 'class',
        literal
    };
}

export function isClassType(item: TypeDescription): item is ClassTypeDescription {
    return item.$type === 'class';
}

export interface ErrorType {
    readonly $type: 'error'
    readonly source?: AstNode
    readonly message: string
}

export function createErrorType(message: string, source?: AstNode): ErrorType {
    return {
        $type: 'error',
        message,
        source
    };
}

export function isErrorType(item: TypeDescription): item is ErrorType {
    return item.$type === 'error';
}

export function typeToString(item: TypeDescription): string {
    if (isClassType(item)) {
        return item.literal.name;
    } else if (isFunctionType(item)) {
        const params = item.parameters.map(e => `${e.name}: ${typeToString(e.type)}`).join(', ');
        return `(${params}) => ${typeToString(item.returnType)}`;
    } else {
        return item.$type;
    }
}
