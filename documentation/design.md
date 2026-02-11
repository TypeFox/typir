# Design

This describes the main design principles of and the terminology used by Typir.


## Type

Each type exists only once in a Typir instance. Types at runtime are instances of a sub-class of the TypeScript class `Type`.
Two different instances of `Type` represent two different types in Typir.

All types need to have *unique identifiers* in order to identifier duplicate types and to access types by their identifier.
If Typir reports errors regarding non-unique identifiers, check the following possibles reasons for colliding identifiers:

- The calculation for identifiers does not encode all relevant properties in the identifier. In that case, for types with different properties, the same identifier is calculated, which leads to collisions.
- Two different type factories produce colliding identifiers, e.g. since the same type factory is instantiated multiple times with the same prefix for identifiers or the same calculation of identifiers.

Types also have a *name*, which is used as a short name for types, e.g. used to be shown in error messages to users. Names don't need to be unique.

TODO: states/lifecycle of a type

Each type has exactly one kind, as explained below.


## Kind / Factory


## Type graph

Each type system, i.e. each instance of the `TypirServices`, has one type graph, which stores the available types and their relationships:

- nodes are types, e.g. primitive types and function types
- edges are relationships between types, e.g. edges representing implicit conversion between two types


## Incrementality (under construction)

- add/remove types
- add/remove rules and relationships


## Language

Usually, type systems are created to do some type checking on textual languages, including domain-specific languages (DSLs) and general-purpose programming languages. Programs respective text conforming to these languages are parsed and provided as abstract syntax trees (ASTs) in-memory.
ASTs usually consist of a tree of nodes (realized as JavaScript objects at runtime), which represent a small part of the program/text after parsing.
During linking, cross-references between the nodes of the tree are established, i.e. the tree becomes a graph.
Type checking is done on these ASTs.

### Language node

Since Typir has no preconditions regarding the structure of the AST or the technical details of the AST nodes in order to provide type checking for any data structure,
the term *language node* is used to describe a single node in the AST or a single element in a complex data structure.
As an example, in the context of Langium each `AstNode` is a language node in Typir.

While the definition of types and their relationships is independent from the AST,
type inference and validations are done on language nodes,
e.g. an inference rule gets a language node as input and returns its inferred Typir type.
All information Typir needs to know about language nodes is specified in the APIs, including the APIs for inference rules, validations rules and the [language service](./services/language.md).

### Language type

The TypeScript type of a language node is called *language type*.

### Language key

Each language node might have a *language key*.
Language keys are `string` values and are used to increase performance by registering rules for inference and validation not for all language nodes,
but only for language nodes with a particular language key.
Rules associated to no language key are applied to all language nodes.
Rules might be associated to multiple language keys.
Getting the language key of a language node is done by the [language service](./services/language.md).
The available language keys could be restricted by customizing the specifics of your language in this way:

```typescript
export type MyAstTypes = {
    LanguageKey1: LanguageType1;
    LanguageKey2: LanguageType2;
    // ...
}

export interface MySpecifics extends TypirSpecifics {
    LanguageKeys: MyAstTypes;
}
```


## Services and default implementations

- services
- (default) implementations
- Typir module in `typir.ts`: assembles services and implementations
  - It is possible to group services
  - Names of services start with an uppercase letter, names of groups start with a lowercase letter
- Dependency injection (DI)
  - cyclic dependencies
  - compile time vs runtime
