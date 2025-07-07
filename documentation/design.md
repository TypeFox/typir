# Design

This describes the main design principles of Typir.

## Core principles

### Type

- identifier
- name
- single instances
- kind

### Kind

### Type graph

Each type system, i.e. each instance of the `TypirServices`, has one type graph:

- nodes are types, e.g. primitive types and function types
- edges are relationships between types, e.g. edges representing implicit conversion between two types

### Incrementality (under construction)

- add/remove types
- add/remove rules and relationships

### Services and default implementations

- services
- (default) implementations
- Typir module in `typir.ts`: assembles services and implementations
- Dependency injection (DI)


## Terminology / Glossary

- inference: inference rule, type inference
- language node, language key
-
