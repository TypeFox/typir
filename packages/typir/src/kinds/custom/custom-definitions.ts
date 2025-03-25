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

export type CustomTypeProperties = Record<string, CustomTypePropertyTypes>;
// all properties might be optional or mandatory, this is kept in the derived types!

export type CustomTypePropertyTypes =
    // | CustomTypeProperties // TODO Djinject hat so eine Schachtelung drin!
    // | Record<string, CustomTypePropertyTypes>
    | Type
    | CustomTypePropertyTypes[] | Map<string, CustomTypePropertyTypes> | Set<CustomTypePropertyTypes>
    | string | number | boolean | bigint;


/* Corresponding properties for specification during the initialization */

export type CustomTypePropertyInitialization<T extends CustomTypePropertyTypes, LanguageType = unknown> =
    // replace Type by a TypeSelector for it ...
    T extends Type ? TypeSelector<T, LanguageType> : // note that TypeSelector includes "unknown" (if the LanguageType is not specified), which makes the TypeScript type-checking "useless" here!
    // ... in recursive way for the composites:
    T extends Array<infer ValueType> ? (ValueType extends CustomTypePropertyTypes ? Array<CustomTypePropertyInitialization<ValueType, LanguageType>> : never) :
    T extends Map<string, infer ValueType> ? (ValueType extends CustomTypePropertyTypes ? Map<string, CustomTypePropertyInitialization<ValueType, LanguageType>> : never) :
    T extends Set<infer ValueType> ? (ValueType extends CustomTypePropertyTypes ? Set<CustomTypePropertyInitialization<ValueType, LanguageType>> : never) :
    // unchanged for the atomic cases:
    T;

export type CustomTypeInitialization<T extends CustomTypeProperties, LanguageType = unknown> = {
    [P in keyof T]: CustomTypePropertyInitialization<T[P], LanguageType>;
};


/* Corresponding properties to store inside the type */

export type CustomTypePropertyStorage<T extends CustomTypePropertyTypes, LanguageType = unknown> =
    // replace Type by a TypeReference to it ...
    T extends Type ? TypeReference<T, LanguageType> :
    // ... in recursive way for the composites:
    T extends Array<infer ValueType> ? (ValueType extends CustomTypePropertyTypes ? Array<CustomTypePropertyStorage<ValueType, LanguageType>> : never) :
    T extends Map<string, infer ValueType> ? (ValueType extends CustomTypePropertyTypes ? Map<string, CustomTypePropertyStorage<ValueType, LanguageType>> : never) :
    T extends Set<infer ContentType> ? (ContentType extends CustomTypePropertyTypes ? Set<CustomTypePropertyStorage<ContentType, LanguageType>> : never) :
    // unchanged for the atomic cases:
    T;

export type CustomTypeStorage<T extends CustomTypeProperties, LanguageType = unknown> = {
    [P in keyof T]: CustomTypePropertyStorage<T[P], LanguageType>;
};
