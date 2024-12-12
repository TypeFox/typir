/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type } from '../graph/type-node.js';
import { TypeInitializer } from './type-initializer.js';
import { TypeReference } from './type-reference.js';

// This TypeScript type defines the possible ways to identify a wanted Typir type.
// TODO find better names: TypeSpecification, TypeDesignation/Designator, ... ?
export type BasicTypeSelector =
    | Type              // the instance of the wanted type
    | string            // identifier of the type (in the type graph/map)
    | TypeInitializer   // delayed creation of types
    | TypeReference     // reference to a (maybe delayed) type
    | unknown           // domain node to infer the final type from
    ;
export type TypeSelector =
    | BasicTypeSelector             // all base type selectors
    | (() => BasicTypeSelector);    // all type selectors might be given as functions as well, in order to ease delayed specifications
