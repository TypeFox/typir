# Design

This describes the main design principles of Typir.

## Core principles

### Type

All types need to have *unique identifiers* in order to identifier duplicate types and to access types by their identifier.
If Typir reports errors regarding non-unique identifiers, check the following possibles reasons for colliding identifiers:

- The calculation for identifiers does not encode all relevant properties in the identifier. In that case, for types with different properties, the same identifier is calculated, which leads to collisions.
- Two different type factories produce colliding identifiers, e.g. since the same type factory is instantiated multiple times with the same prefix for identifiers or the same calculation of identifiers.

Types also have a *name*, which is used as a short name for types, e.g. used to be shown in error messages to users. Names don't need to be unique.

TODO:

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
  - It is possible to group services
  - Names of services start with an uppercase letter, names of groups start with a lowercase letter
- Dependency injection (DI)


## Terminology / Glossary

- inference: inference rule, type inference
- language node, language key
-
