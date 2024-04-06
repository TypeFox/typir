/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { assertUnreachable } from 'langium';
import { Type, isType } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { TypeConflict } from '../utils/utils-type-comparison.js';

export interface TypeConflictPrinter {
    printTypeConflict(conflict: TypeConflict): string;
    printTypeConflicts(conflicts: TypeConflict[]): string;
}

export class DefaultTypeConflictPrinter implements TypeConflictPrinter {
    protected readonly typir: Typir;

    constructor(typir: Typir) {
        this.typir = typir;
    }

    printTypeConflict(conflict: TypeConflict): string {
        return this.printTypeConflictLevel(conflict, 0);
    }

    protected printTypeConflictLevel(conflict: TypeConflict, level: number): string {
        // the current conflict
        let result = this.printSingleConflict(conflict);
        // indentation
        for (let i = 0; i < level - 1; i++) {
            result = `     ${result}`; // 5 spaces
        }
        if (level >= 1) {
            result = `|--> ${result}`; // 5 signs
        }
        // the sub-conflicts
        if (conflict.subConflicts && conflict.subConflicts.length >= 1) {
            result = result + '\n' + this.printTypeConflictsLevel(conflict.subConflicts, level + 1);
        }
        return result;
    }

    protected printSingleConflict(conflict: TypeConflict): string {
        const valueKind = toValueKind(conflict);
        const action = conflict.action;
        const location = conflict.location;
        const expected = this.printOneSide(conflict.expected);
        const actual = this.printOneSide(conflict.actual);
        switch (action) {
            case 'EQUAL_TYPE':
                switch (valueKind) {
                    case 'BOTH':            return `For equality, at ${location}', ${expected} on the one side fits not to ${actual} on the other side.`;
                    case 'ONLY_EXPECTED':   return `For equality, at ${location}', ${expected} on the one side has no counterpart on the other side.`;
                    case 'ONLY_ACTUAL':     return `For equality, at ${location}', on the one side there is no counterpart for ${actual} on the other side.`;
                    case 'NONE': throw new Error();
                    default: return assertUnreachable(valueKind);
                }
            case 'ASSIGNABLE_TYPE':
                switch (valueKind) {
                    case 'BOTH':            return `At ${location}, ${expected} is not assignable to ${actual}.`;
                    case 'ONLY_EXPECTED':   return `At ${location}, ${expected} cannot be assigned, since there is nothing to assign this to.`;
                    case 'ONLY_ACTUAL':     return `At ${location}, for ${actual}, there is nothing to assign to it.`;
                    case 'NONE': throw new Error();
                    default: return assertUnreachable(valueKind);
                }
            case 'SUB_TYPE':
                switch (valueKind) {
                    case 'BOTH':            return `For ${location}, ${expected} is no super type for ${actual}.`;
                    case 'ONLY_EXPECTED':   return `For ${location}, ${expected} as super type has no counterpart for the sub type.`;
                    case 'ONLY_ACTUAL':     return `For ${location}, ${actual} as sub type has no counterpart for the super type.`;
                    case 'NONE': throw new Error();
                    default: return assertUnreachable(valueKind);
                }
            default:
                assertUnreachable(action);
        }
    }

    protected printOneSide(type: Type | string | undefined): string {
        if (type === undefined) {
            return 'a missing type';
        } else if (isType(type)) {
            return `the type '${type.getUserRepresentation()}'`;
        } else if (typeof type === 'string') {
            return `${type}`;
        } else {
            assertUnreachable(type);
        }
    }

    printTypeConflicts(conflicts: TypeConflict[]): string {
        return this.printTypeConflictsLevel(conflicts, 0);
    }

    protected printTypeConflictsLevel(conflicts: TypeConflict[], level: number): string {
        return conflicts.map(c => this.printTypeConflictLevel(c, level)).join('\n');
    }
}

/* Utilities */

type ValueKinds = 'BOTH' | 'ONLY_EXPECTED' | 'ONLY_ACTUAL' | 'NONE';

function toValueKind(conflict: TypeConflict): ValueKinds {
    const expected = conflict.expected;
    const actual = conflict.actual;
    if (expected !== undefined && actual !== undefined) {
        return 'BOTH';
    }
    if (expected !== undefined && actual === undefined) {
        return 'ONLY_EXPECTED';
    }
    if (expected === undefined && actual !== undefined) {
        return 'ONLY_ACTUAL';
    }
    if (expected === undefined && actual === undefined) {
        return 'NONE';
    }
    throw new Error();
}
