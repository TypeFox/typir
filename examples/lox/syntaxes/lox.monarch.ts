/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

// Monarch syntax highlighting for the lox language.
export default {
    keywords: [
        'and',
        'boolean',
        'class',
        'else',
        'false',
        'for',
        'fun',
        'if',
        'nil',
        'number',
        'or',
        'print',
        'return',
        'string',
        'super',
        'this',
        'true',
        'var',
        'void',
        'while',
    ],
    operators: [
        '!',
        '!=',
        '*',
        '+',
        ',',
        '-',
        '.',
        '/',
        ':',
        ';',
        '<',
        '<=',
        '=',
        '==',
        '=>',
        '>',
        '>=',
    ],
    symbols: /!|!=|\(|\)|\*|\+|,|-|\.|\/|:|;|<|<=|=|==|=>|>|>=|\{|\}/,

    tokenizer: {
        initial: [
            {
                regex: /[_a-zA-Z][\w_]*/,
                action: {
                    cases: {
                        '@keywords': { token: 'keyword' },
                        '@default': { token: 'ID' },
                    },
                },
            },
            { regex: /[0-9]+(\.[0-9]+)?/, action: { token: 'number' } },
            { regex: /"[^"]*"/, action: { token: 'string' } },
            { include: '@whitespace' },
            {
                regex: /@symbols/,
                action: {
                    cases: {
                        '@operators': { token: 'operator' },
                        '@default': { token: '' },
                    },
                },
            },
        ],
        whitespace: [
            { regex: /\s+/, action: { token: 'white' } },
            { regex: /\/\*/, action: { token: 'comment', next: '@comment' } },
            { regex: /\/\/[^\n\r]*/, action: { token: 'comment' } },
        ],
        comment: [
            { regex: /[^*]+/, action: { token: 'comment' } },
            { regex: /\*\//, action: { token: 'comment', next: '@pop' } },
            { regex: /[*]/, action: { token: 'comment' } },
        ],
    },
};
