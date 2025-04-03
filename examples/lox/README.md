# Typir applied to LOX

This package contains an adapted version of [LOX](https://craftinginterpreters.com/the-lox-language.html), [realized with Langium](https://github.com/TypeFox/langium-lox) and statically type-checked with [Typir](https://typir.org/).

Typir is used here to make LOX a statically typed language:

- Variables have one type, which is either explicitly declared (e.g. `var v1: string`) or derived from the initial value (e.g. `var v2 = 2 <= 3`).
- Lox supports these types here:
  - primitives: boolean, string, number, void
  - Classes (nominally typed)
  - Lambdas (not yet supported)
- We keep `nil`, but it can be assigned only to variables with a class or lambda as type.
  Variables with primitive type and without explicit initial value have the primitive types default value.

For examples written in LOX, look at some [collected examples](./examples/) or the [test cases](./test/).

To compare the current implementation for type checking with Typir with an implementation without Typir, have a look into [this repository](https://github.com/TypeFox/langium-lox/tree/main/langium/src/language-server/type-system).
