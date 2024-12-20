# Typir-Langium: Typir integration for Langium

Typir-Langium is a framework for type checking of languages developed with [Langium](https://langium.org),
the language workbench for developing textual domain-specific languages (DSLs) in the web.

Typir-Langium depends on Typir, the stand-alone library for type systems and type checking for software languages in the web, independent from any language workbench.
Typir-Langium is a dedicated binding of Typir for DSLs which are developed with Langium.


## Installation

```bash
npm install typir-langium
```

## Documentation

For an overview about the core features of Typir with a simple application example, see the [root README.md of the Typir project](/README.md).

Important design decision for Typir-Langium:
Typir-Langium does not depend on `langium/lsp`, i.e. Typir-Langium can be used even for Langium-based DSLs which don't use LSP.

Integrate Typir as additional Langium service into your DSL.

```typescript
export type MyDSLAddedServices = {
    // ...
    typir: LangiumServicesForTypirBinding,
    // ...
}
```

In case of a [multi-language project](https://langium.org/docs/recipes/multiple-languages/), this approach enables you to manage multiple type systems in parallel by having `typir1: LangiumServicesForTypirBinding`, `typir2: LangiumServicesForTypirBinding` and so on.


## Examples

Look at the examples in the `examples/` folder of the repo ([here](../../examples)). There we have some demo projects for you to get started.

## License

[MIT License](/LICENSE)
