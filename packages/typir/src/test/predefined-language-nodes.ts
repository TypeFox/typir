/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { InferOperatorWithMultipleOperands } from '../services/operator.js';
import { DefaultTypeConflictPrinter } from '../services/printing.js';

/* eslint-disable @typescript-eslint/parameter-properties */

/**
 * Base class for all language nodes,
 * which are predefined for test cases.
 */
export abstract class TestLanguageNode {

    constructor() {
        // empty
    }

    print(): string {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const obj = this;
        const properties = Object.entries(obj)
            .map((key, value) => `${key}: ${this.printObject(value)}`)
            .join(', ');
        return `${this.constructor.name}(${properties})`;
    }

    protected printObject(obj: unknown): string {
        if (Array.isArray(obj)) {
            const entries = Array.from(obj.values()).map(v => this.printObject(v)).join(', ');
            return `[${entries}]`;
        }
        if (obj instanceof TestLanguageNode) {
            return `${obj.print()}`;
        }
        return `${obj}`;
    }

}

export abstract class TestExpressionNode extends TestLanguageNode {
}

export abstract class TestStatementNode extends TestLanguageNode {
}


export class IntegerLiteral extends TestExpressionNode {
    constructor(
        public value: number,
    ) { super(); }
}
export class DoubleLiteral extends TestExpressionNode {
    constructor(
        public value: number,
    ) { super(); }
}
export class BooleanLiteral extends TestExpressionNode {
    constructor(
        public value: boolean,
    ) { super(); }
}
export class StringLiteral extends TestExpressionNode {
    constructor(
        public value: string,
    ) { super(); }
}

// some predefined literals
export const integer2 = new IntegerLiteral(2);
export const integer3 = new IntegerLiteral(3);
export const integer123 = new IntegerLiteral(123);
export const integer456 = new IntegerLiteral(456);

export const double123_0 = new DoubleLiteral(123.0);
export const double456_0 = new DoubleLiteral(456.0);
export const double2_0 = new DoubleLiteral(2.0);
export const double3_0 = new DoubleLiteral(3.0);

export const booleanTrue = new BooleanLiteral(true);
export const booleanFalse = new BooleanLiteral(false);

export const string123 = new StringLiteral('123');
export const string456 = new StringLiteral('456');
export const string2 = new StringLiteral('2');
export const string3 = new StringLiteral('3');


export class BinaryExpression extends TestExpressionNode {
    constructor(
        public left: TestExpressionNode,
        public operator: string,
        public right: TestExpressionNode,
    ) { super(); }
}


export class Variable extends TestLanguageNode {
    constructor(
        public name: string,
        public initialValue: TestExpressionNode, // the type of this initialization expression is used as type of the variable
    ) { super(); }
}


export class AssignmentStatement extends TestStatementNode {
    constructor(
        public left: Variable,
        public right: TestExpressionNode,
    ) { super(); }
}

export class StatementBlock extends TestStatementNode {
    constructor(
        public statements: TestLanguageNode[],
    ) { super(); }
}


/*
 * Some predefined utils for configuring Typir accordingly
 */

export const InferenceRuleBinaryExpression: InferOperatorWithMultipleOperands<BinaryExpression> = {
    filter: node => node instanceof BinaryExpression,
    matching: (node, operatorName) => node.operator === operatorName,
    operands: node => [node.left, node.right],
    validateArgumentsOfCalls: true,
};

export class TestProblemPrinter extends DefaultTypeConflictPrinter {
    override printLanguageNode(languageNode: unknown, sentenceBegin?: boolean | undefined): string {
        if (languageNode instanceof TestLanguageNode) {
            return `${sentenceBegin ? 'T' : 't'}he language node '${languageNode.print()}'`;
        }
        return super.printLanguageNode(languageNode, sentenceBegin);
    }
}
