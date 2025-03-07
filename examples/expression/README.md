# A handwritten parser

This package contains a handwritten parser for a simple expression language.
The language supports:

- Variables declarations with the types `number` and `string`
- Variable Assignments
- Arithmetic expressions
- Print statements
- Expressions, like basic arithmetic operations, string concatenation, variable references, literals and parentheses

## How does it work?

Parsing is a linear process that takes a string of text and produces a tree-like structure that represents the structure of the text.

```mermaid
flowchart LR
    A[Lexer] --> B[Parser]
    CC@{shape: brace-r, label: "Typir is applied here"} --> C
    B --> C[Type System]
    C --> D[Validator]

    style C fill:#f9f,stroke:#333,stroke-width:4px
```

The following sections describe each step in the process.

### Lexer

**Input**: A string of text

**Output**: A list of tokens

**Task**: Splits the text to tokens and classifies each token.

```mermaid
flowchart LR
    AA@{shape: brace-r, label: "variable = 123"} --> A
    A[/text/] --> B[Lexer]
    B --> Tokens
    subgraph Tokens
      T1[variable:ID]
      T2[=:ASSIGN]
      T3[123:NUMBER]
    end
```

### Parser

**Input**: A list of tokens

**Output**: An Abstract Syntax Tree (AST)

**Task**: Takes token and arranges them as a tree.

```mermaid
flowchart LR
    subgraph Tokens
      T1[variable:ID]
      T2[=:ASSIGN]
      T3[123:NUMBER]
    end

    Tokens --> D[Parser]
    subgraph AST
        EE1[variable]
        EE2[=]
        EE3[123]
        EE2 --> EE1
        EE2 --> EE3
    end
    D --> AST
```

### Type system

**Input**: An AST

**Output**: A typed AST

**Task**: Assigns types to the nodes of the AST.

```mermaid
flowchart LR
    subgraph AST
        EE1[variable]
        EE2[=]
        EE3[123]
        EE2 --> EE1
        EE2 --> EE3
    end
    FF@{shape: brace-r, label: "described by Typir"} --> F
    AST --> F[Type System]
    F --> AST2
    subgraph AST2"Typed AST"
        FF1[variable:STRING]
        FF2[=]
        FF3[123:NUMBER]
        FF2 --> FF1
        FF2 --> FF3
    end

    style F fill:#f9f,stroke:#333,stroke-width:4px
```

### Validator

**Input**: A typed AST

**Output**: a list of errors

**Task**: Checks if the AST is valid.

```mermaid
flowchart LR
    subgraph AST["Typed AST"]
        FF1[variable:STRING]
        FF2[=]
        FF3[123:NUMBER]
        FF2 --> FF1
        FF2 --> FF3
    end
    AST --> H[Validator]
    H --> I[/errors/]
    H --> J[/valid!/]
```
