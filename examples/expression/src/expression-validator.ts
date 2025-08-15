/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/
import { TypirServices } from 'typir';
import { Expression, Model, Node } from './expression-ast.js';
import { ExpressionSpecifics } from './expression-type-system.js';

export function validate(typir: TypirServices<ExpressionSpecifics>, model: Model, accept: (message: string) => void) {
    function runValidator(languageNode: Node) {
        typir.validation.Collector.validate(languageNode).forEach(m => accept(m.message));
    }
    function visitExpression(expr: Expression) {
        switch(expr.type) {
            case 'binary':
                visitExpression(expr.left);
                visitExpression(expr.right);
                break;
            case 'unary':
                visitExpression(expr.operand);
                break;
            case 'variable-usage':
            case 'numeric':
            case 'string':
                break;
        }
        runValidator(expr);
    }
    for (const statement of model) {
        visitExpression(statement.value);
        runValidator(statement);
    }
}
