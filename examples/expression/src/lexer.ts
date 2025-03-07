/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

/**
 * This is a table of all token type definitions required to parse the language.
 * The order is important! The last token type ERROR is meant to catch all bad input.
 */
const TokenDefinitions = {
    WS: /\s+/,
    VAR: /VAR/,
    PRINT: /PRINT/,
    LPAREN: /\(/,
    RPAREN: /\)/,
    ASSIGN: /=/,
    SEMICOLON: /;/,
    ID: /[A-Z_][A-Z_0-9]*/,
    NUM: /[0-9]+/,
    STRING: /"([^"\\]|\\["\\])*"/,
    ADD_OP: /\+|-/,
    MUL_OP: /\*|\/|%/,
    ERROR: /./
} satisfies Record<string, RegExp>;

export type TokenType = keyof typeof TokenDefinitions;

export type Token = {
    type: TokenType;
    content: string;
};

/**
 * A tokenizer (or lexer) takes a string, analyzes it and returns tokens representing the split text.
 * Each token is meant as a piece of text with a special token type or character class.
 * @param text
 */
export function* tokenize(text: string): Generator<Token, void> {
    let position = 0;
    const definitions = stickyfy(TokenDefinitions);
    while(position < text.length) {
        for (const [type, regexp] of Object.entries(definitions)) {
            regexp.lastIndex = position;
            const match = regexp.exec(text);
            if(match) {
                const content = match[0];
                position += content.length;
                yield {
                    type: type as TokenType,
                    content
                };
                break;
            }
        }
    }
}

/**
 * Stickify helps to transform the token type RegExps to become `sticky` (y) and `case-insensitive` (i).
 * Sticky means that we can set the offset where the RegExp has to start matching.
 */
function stickyfy(definitions: typeof TokenDefinitions) {
    return Object.fromEntries(
        Object.entries(definitions)
            .map(([name, regexp]) => [name, new RegExp(regexp, 'yi')])
    ) as typeof TokenDefinitions;
}
