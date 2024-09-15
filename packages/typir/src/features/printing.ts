/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { TypirProblem } from '../utils/utils-definitions.js';
import { IndexedTypeConflict, ValueConflict, isIndexedTypeConflict, isValueConflict } from '../utils/utils-type-comparison.js';
import { toArray } from '../utils/utils.js';
import { AssignabilityProblem, isAssignabilityProblem } from './assignability.js';
import { TypeEqualityProblem, isTypeEqualityProblem } from './equality.js';
import { InferenceProblem, isInferenceProblem } from './inference.js';
import { SubTypeProblem, isSubTypeProblem } from './subtype.js';
import { ValidationProblem, isValidationProblem } from './validation.js';

export interface ProblemPrinter {
    printValueConflict(problem: ValueConflict): string;
    printIndexedTypeConflict(problem: IndexedTypeConflict): string;
    printAssignabilityProblem(problem: AssignabilityProblem): string;
    printSubTypeProblem(problem: SubTypeProblem): string;
    printTypeEqualityProblem(problem: TypeEqualityProblem): string;
    printInferenceProblem(problem: InferenceProblem): string;
    printValidationProblem(problem: ValidationProblem): string

    printTypirProblem(problem: TypirProblem): string;
    printTypirProblems(problems: TypirProblem[]): string;

    printDomainElement(domainElement: unknown, sentenceBegin: boolean): string;
    /** This function should be used by other services, not type.getName(). */
    printTypeName(type: Type): string;
    /** This function should be used by other services, not type.getUserRepresentation(). */
    printTypeUserRepresentation(type: Type): string;
}

export class DefaultTypeConflictPrinter implements ProblemPrinter {
    protected readonly typir: Typir;

    constructor(typir: Typir) {
        this.typir = typir;
    }

    printValueConflict(problem: ValueConflict, level: number = 0): string {
        let result = `At ${problem.location}, `;
        const left = problem.firstValue;
        const right = problem.secondValue;
        if (left !== undefined && right !== undefined) {
            result = result + `${left} and ${right} do not match.`;
        } else if (left !== undefined && right === undefined) {
            result = result + `${left} on the left has no opposite value on the right to match.`;
        } else if (left === undefined && right !== undefined) {
            result = result + `there is no value on the left to match with ${right} on the right.`;
        } else {
            throw new Error();
        }
        result = this.printIndentation(result, level);
        return result;
    }

    printIndexedTypeConflict(problem: IndexedTypeConflict, level: number = 0): string {
        const left = problem.expected;
        const right = problem.actual;
        let result = '';
        if (typeof problem.index === 'number') {
            result = result + `At index ${problem.index}, `;
        } else {
            result = result + `For property '${problem.index}', `;
        }
        if (left !== undefined && right !== undefined) {
            result = result + `the types '${this.printTypeName(left)}' and '${this.printTypeName(right)}' do not match.`;
        } else if (left !== undefined && right === undefined) {
            result = result + `the type '${this.printTypeName(left)}' on the left has no opposite type on the right to match with.`;
        } else if (left === undefined && right !== undefined) {
            result = result + `there is no type on the left to match with the type '${this.printTypeName(right)}' on the right.`;
        } else {
            throw new Error();
        }
        result = this.printIndentation(result, level);
        result = this.printSubProblems(result, problem.subProblems, level);
        return result;
    }

    printAssignabilityProblem(problem: AssignabilityProblem, level: number = 0): string {
        let result = `The type '${this.printTypeName(problem.source)}' is not assignable to the type '${this.printTypeName(problem.target)}'.`;
        result = this.printIndentation(result, level);
        result = this.printSubProblems(result, problem.subProblems, level);
        return result;
    }

    printSubTypeProblem(problem: SubTypeProblem, level: number = 0): string {
        let result = `The type '${this.printTypeName(problem.superType)}' is no super-type of '${this.printTypeName(problem.subType)}'.`;
        result = this.printIndentation(result, level);
        result = this.printSubProblems(result, problem.subProblems, level);
        return result;
    }

    printTypeEqualityProblem(problem: TypeEqualityProblem, level: number = 0): string {
        let result = `The types '${this.printTypeName(problem.type1)}' and '${this.printTypeName(problem.type2)}' are not equal.`;
        result = this.printIndentation(result, level);
        result = this.printSubProblems(result, problem.subProblems, level);
        return result;
    }

    printInferenceProblem(problem: InferenceProblem, level: number = 0): string {
        let result = `While inferring the type for ${this.printDomainElement(problem.domainElement)}, at ${problem.location}`;
        if (problem.inferenceCandidate) {
            result = result + ` of the type '${this.printTypeName(problem.inferenceCandidate)}' as candidate to infer`;
        }
        result = result + ', some problems occurred.';
        // Since Rules have no name (yet), it is not possible to print problem.rule here.
        result = this.printIndentation(result, level);
        result = this.printSubProblems(result, problem.subProblems, level);
        return result;
    }

    printValidationProblem(problem: ValidationProblem, level: number = 0): string {
        let result = `While validating ${this.printDomainElement(problem.domainElement)}, this ${problem.severity} is found: ${problem.message}`;
        result = this.printIndentation(result, level);
        result = this.printSubProblems(result, problem.subProblems, level);
        return result;
    }

    printTypirProblem(problem: TypirProblem, level: number = 0): string {
        if (isValueConflict(problem)) {
            return this.printValueConflict(problem, level);
        } else if (isIndexedTypeConflict(problem)) {
            return this.printIndexedTypeConflict(problem, level);
        } else if (isAssignabilityProblem(problem)) {
            return this.printAssignabilityProblem(problem, level);
        } else if (isSubTypeProblem(problem)) {
            return this.printSubTypeProblem(problem, level);
        } else if (isTypeEqualityProblem(problem)) {
            return this.printTypeEqualityProblem(problem, level);
        } else if (isInferenceProblem(problem)) {
            return this.printInferenceProblem(problem, level);
        } else if (isValidationProblem(problem)) {
            return this.printValidationProblem(problem, level);
        } else {
            throw new Error(`Unhandled typir problem ${problem.$problem}`);
        }
    }

    printTypirProblems(problems: TypirProblem[], level: number = 0): string {
        return problems.map(p => this.printTypirProblem(p, level)).join('\n');
    }

    printDomainElement(domainElement: unknown, sentenceBegin: boolean = false): string {
        return `${sentenceBegin ? 'T' : 't'}he domain element '${domainElement}'`;
    }

    printTypeName(type: Type): string {
        return type.getName();
    }

    printTypeUserRepresentation(type: Type): string {
        return type.getUserRepresentation();
    }

    protected printSubProblems(result: string, subProblems: undefined | TypirProblem[], level: number = 0): string {
        const problems = toArray(subProblems);
        if (problems.length >= 1) {
            return result + '\n' + this.printTypirProblems(problems, level + 1);
        } else {
            return result;
        }
    }

    protected printIndentation(result: string, level: number): string {
        // Note, that VSCode skips long whitespace in the "Problems" view
        if (level >= 1) {
            result = `-> ${result}`;
        }
        for (let i = 2; i <= level; i++) {
            result = `-${result}`;
        }
        return result;
    }
}
