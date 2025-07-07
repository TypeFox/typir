# Documentation

This describes the structure and the main content of the documentation for Typir.

- [Getting started](./getting-started.md) helps you to directly use Typir by describing the entry points of Typir.
- [Design](./design.md) describes the overall architecture of Typir and its main design decisions.
- [Use cases](./usecases.md) collects descriptions for the usual type checking use cases including validation and linking.


## Services for type checking

- [Assignability](./services/assignability.md)
- [Language](./services/language.md): Don't interchange "language service" and "language server"!
- [Type inference](./services/inference.md)
- ...

## Predefined types

- ...

## Bindings

While Typir (core) is language workbench-independent in general,
some Typir bindings are provided for type-checking languages which are developed with a dedicated language workbench.
Bindings usually provide all features of Typir core and add some more features and APIs to ease type checking with the target language workbench.

- Typir (core) for any languages, developed with or without a language workbench
- [Typir-Langium](./bindings/binding-langium.md) for languages developed with [Langium](https://langium.org/)
- Test fixtures: some predefined AST nodes and adapted Typir service implementations to ease writing internal test cases for Typir itself, see [predefined-language-nodes.ts](../packages/typir/src/test/predefined-language-nodes.ts)


## Customization

Typir provides a default implementation for all services, which are fine for many languages. To create type systems for languages where these default implementations are not enough, the [customization](./customization.md) section describes how to adapt nearly all parts of Typir in general.
Beyond that, the sections about the services give some hints for interesting customizations in more detail.

If the predefined types are not enough for the current language,
Typir provides an [API to define custom types](./kinds/custom-types.md) for your language.


## Examples

This repository contains the following stand-alone applications. Read their linked README.md files to learn more about them:

- [LOX](./examples/lox/README.md) - static type checking for LOX, implemented with Typir-Langium
- [OX](./examples/ox/README.md) - a reduced version of LOX, implemented with Typir-Langium
- Expressions - TODO

Some of the internal test cases developed in [packages/typir/test/](../packages/typir/test/) demonstrate some features of Typir in more detail.
