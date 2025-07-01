# Design

This describes the main design principles of Typir.

## Core principles

### Type

- identifier
- name
- single instances
- kind

### Type graph

Each type system, i.e. each instance of the `TypirServices`, has one type graph:

- nodes are types
- edges are relationships between types

### Incrementality (under construction)

- add/remove types
- add/remove rules and relationships

### Services and default implementations

- services
- (default) implementations
- Typir module in `typir.ts`: assembles services and implementations
- Dependency injection (DI)
