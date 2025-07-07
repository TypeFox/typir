# Language

The language service provides some static information about the language/DSL, for which the type system is created.
These information are exploited to improve performance and to provide some advanced features of Typir.
Don't interchange the terms "language service" (this Typir service) and "language server" (from Language Server Protocol (LSP) terminology)!

Central for performance improvements is the concept of *language keys* for language nodes:

If rules for validation and type inference are associated to a language key,
these rules are applied only to those language nodes which have this language key, not to all language nodes.
It is possible to associate rules to multiple language keys.
Rules which are associated to no language key, are applied to all language nodes.

Language keys are represented by string values and might be depending on the DSL implementation/language workbench,
class names or `$type`-property-information of the language node implementations.
Language keys might have sub/super language keys ("sub-type relationship of language keys").

## API

The API of the language service is defined in the interface `LanguageService`.
Usually this service is not called by users of Typir, but by implementations of other Typir services.

The central API call for language keys queries the language key for a given language node:

```typescript
typir.Language.getLanguageNodeKey(languageNode: unknown): string | undefined
```

If language nodes have no language key, only rules which are registered for no language key are applied,
since rules without associated language key are applied to *all* language nodes.


## Default implementation

The default implementation provides no information about the current language at all.
Therefore you should provide an implementation specific for your current language/AST in order to get all benefits like performance improvements.
Nevertheless, the default implementation works in general.

The bindings of Typir for language workbenches provide some default implementations dedicated for languages developed with this language workbench.
Therefore if you use such a Typir binding like Typir-Langium, you don't need to implement the language service anymore.
