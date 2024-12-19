# Typir integration for Langium

Typir-Langium is a framework for type checking of languages developed with [Langium](https://langium.org),
the language workbench for developing textual domain-specific languages (DSLs) in the web.

## Installation

```bash
npm install typir-langium
```

## Documentation

Will follow!

Important design decisions:

- Typir-Langium does not depend on `langium/lsp`, i.e. Typir-Langium can be used even for Langium-based DSLs which don't use LSP.

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

Look at the examples in the `examples` folder of the repo ([here](../../examples)). There we have some demo projects for you to get started.

## License

[MIT License](/LICENSE)
