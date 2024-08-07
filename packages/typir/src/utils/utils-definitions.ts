/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { AssignabilityProblem } from '../features/assignability.js';
import { TypeEqualityProblem } from '../features/equality.js';
import { InferenceProblem } from '../features/inference.js';
import { SubTypeProblem } from '../features/subtype.js';
import { ValidationProblem } from '../features/validation.js';
import { Type } from '../graph/type-node.js';
import { IndexedTypeConflict, ValueConflict } from './utils-type-comparison.js';

export type TypirProblem = ValueConflict | IndexedTypeConflict | AssignabilityProblem | SubTypeProblem | TypeEqualityProblem | InferenceProblem | ValidationProblem;

export type Types = Type | Type[];
export type Names = string | string[];

export type NameTypePair = {
    name: string;
    type: Type;
}
