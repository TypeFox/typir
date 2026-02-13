# Typir-Langium

Typir-Langium is a dedicated binding of Typir for languages and DSLs which are developed with [Langium](https://langium.org),
the language workbench for developing textual domain-specific languages (DSLs) in the web.

TODO

## Validation

All properties of usual diagnostics in Langium (as defined in `DiagnosticInfo`) are supported, when creating validation issues in Typir-Langiums.
This enables, among other use cases, to register code actions for type-related validation issues (see `lox-code-actions.ts` for an example).
Note that `node`, `property` and `index` are renamed to `languageNode`, `languageProperty` and `languageIndex` to be in sync with Typir core.
