/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { assertUnreachable } from 'langium';
import { Type, isType } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { TypeComparisonStrategy, TypeConflict } from '../utils/utils-type-comparison.js';

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
        if (conflict.expected === undefined && conflict.actual === undefined) {
            throw new Error();
        }
        // the current conflict
        let result = this.printAction(conflict.action, conflict.location, this.printOneSide(conflict.expected), this.printOneSide(conflict.actual));
        // indentation
        for (let i = 0; i < level; i++) {
            result = `  ${result}`;
        }
        // the sub-conflicts
        if (conflict.subConflicts && conflict.subConflicts.length >= 1) {
            result = result + '\n' + this.printTypeConflictsLevel(conflict.subConflicts, level + 1);
        }
        return result;
    }

    protected printAction(action: TypeComparisonStrategy, location: string, expected: string, actual: string): string {
        // TODO 'undefined' besser berücksichtigen!
        switch (action) {
            case 'EQUAL_TYPE':
                return `For equality, at '${location}', ${expected} on the one hand fits not to ${actual} on the other hand.`;
            case 'ASSIGNABLE_TYPE':
                return `At '${location}', ${expected} is not assignable to ${actual}.`;
            case 'SUB_TYPE':
                return `At '${location}', ${expected} is no super type for ${actual} as sub type.`;
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
