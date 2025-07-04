/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
******************************************************************************/

/* eslint-disable @typescript-eslint/indent */

import { Type } from '../../graph/type-node.js';
import { TypeReference } from '../../initialization/type-reference.js';
import { TypeSelector } from '../../initialization/type-selector.js';

/* Base properties */

export type CustomTypeProperties = {
    [key: string]: CustomTypePropertyTypes
};
// all properties might be optional or mandatory, this is kept in the derived types!

export type CustomTypePropertyTypes =
    | Type
    | string | number | boolean | bigint | symbol
    | CustomTypePropertyTypes[] | Map<string, CustomTypePropertyTypes> | Set<CustomTypePropertyTypes>
    | CustomTypeProperties // recursive nesting
    ;


/* Corresponding properties for specification during the initialization */

/**
 * TypeSelectors for custom types don't support strings, since they shall by used as primitive properties (and uncertainty needs to be prevented!).
 * As a workaround, encode the string value as a function, e.g. "() => 'MyIndentifer'".
 */
export type TypeSelectorForCustomTypes<T extends Type, LanguageType> = Exclude<TypeSelector<T, LanguageType>, string>;

export type CustomTypePropertyInitialization<T extends CustomTypePropertyTypes, LanguageType> =
    /* replace Type by a TypeSelector for it ...
     * (Note this special case: If the LanguageType is set to "unknown", then the TypeSelector includes "unknown",
     * which makes the TypeScript type-checking "useless" here, i.e. the TypeScript compiler allows you to use any value here (e.g. 'true') which does not work in general!
     * Therefore "unknown" should not be used for LanguageType if possible.) */
    T extends Type ? TypeSelectorForCustomTypes<T, LanguageType> :
    // unchanged for the atomic cases:
    T extends (string | number | boolean | bigint | symbol) ? T :
    // ... in recursive way for the composites:
    T extends Array<infer ValueType> ? (ValueType extends CustomTypePropertyTypes ? Array<CustomTypePropertyInitialization<ValueType, LanguageType>> : never) :
    T extends Map<string, infer ValueType> ? (ValueType extends CustomTypePropertyTypes ? Map<string, CustomTypePropertyInitialization<ValueType, LanguageType>> : never) :
    T extends Set<infer ValueType> ? (ValueType extends CustomTypePropertyTypes ? Set<CustomTypePropertyInitialization<ValueType, LanguageType>> : never) :
    T extends CustomTypeProperties ? CustomTypeInitialization<T, LanguageType> :
    never;

export type CustomTypeInitialization<T extends CustomTypeProperties, LanguageType> = {
    [P in keyof T]: CustomTypePropertyInitialization<T[P], LanguageType>;
};


/* Corresponding properties to store inside the type */

export type CustomTypePropertyStorage<T extends CustomTypePropertyTypes, LanguageType> =
    // replace Type by a TypeReference to it ...
    T extends Type ? TypeReference<T, LanguageType> :
    // unchanged for the atomic cases:
    T extends (string | number | boolean | bigint | symbol) ? T :
    // ... in recursive way for the composites:
    T extends Array<infer ValueType> ? (ValueType extends CustomTypePropertyTypes ? Array<CustomTypePropertyStorage<ValueType, LanguageType>> : never) :
    T extends Map<string, infer ValueType> ? (ValueType extends CustomTypePropertyTypes ? Map<string, CustomTypePropertyStorage<ValueType, LanguageType>> : never) :
    T extends Set<infer ContentType> ? (ContentType extends CustomTypePropertyTypes ? Set<CustomTypePropertyStorage<ContentType, LanguageType>> : never) :
    T extends CustomTypeProperties ? CustomTypeStorage<T, LanguageType> :
    never;

export type CustomTypeStorage<T extends CustomTypeProperties, LanguageType> = {
    [P in keyof T]: CustomTypePropertyStorage<T[P], LanguageType>;
};
