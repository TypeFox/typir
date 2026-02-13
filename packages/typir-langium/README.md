# Typir-Langium: Typir integration for Langium

Typir-Langium is a framework for type checking of languages developed with [Langium](https://langium.org),
the language workbench for developing textual domain-specific languages (DSLs) in the web.

Typir-Langium depends on Typir, the stand-alone library for type systems and type checking for software languages in the web, independent from any language workbench.
Typir-Langium is a dedicated binding of Typir for languages and DSLs which are developed with Langium.


## Installation

```bash
npm install typir-langium
```

## Overview

Typir-Langium provides all features of Typir and adds some specifics for Langium projects:

- Integration of Typir into the lifecycle of Langium, including:
  - For validations, you don't need to traverse the AST on your own, since Typir-Langium hooks into Langium's traversal during the validation phase.
  - Types which depend on `AstNode`s (e.g. user-defined functions or classes) are created and deleted according to Langium's build process.
- Customizations of implementations for some Typir services, e.g. caches use Langium's `DocumentCache`
- Additional APIs to register inference rules and validation rules in the usual Langium style (see below)

For an overview about the core features of Typir with a simple application example, see the [root README.md of the Typir project](../../README.md).

Important design decision for Typir-Langium:
Typir-Langium does not depend on `langium/lsp`, i.e. Typir-Langium can be used even for Langium-based DSLs which don't use LSP.

## Getting started

Integrate Typir as additional Langium service into your DSL (`<MyDSLSpecifics>` is explained later):

```typescript
export type MyDSLAddedServices = {
    // ...
    typir: TypirLangiumServices<MyDSLSpecifics>,
    // ...
}
```

In case of a [multi-language project](https://langium.org/docs/recipes/multiple-languages/), this approach enables you to manage multiple type systems in parallel by having `typir1: TypirLangiumServices`, `typir2: TypirLangiumServices` and so on.

The Typir services are created in your module in this way:

```typescript
{
  // ...
  typir: () => createTypirLangiumServices(shared, reflection, new MyDSLTypeSystem(), { /* customize Typir services here */ }),
  // ...
}
```

After creating the Langium services (which contain the Typir serivces now) and storing them in a variable like `langiumServices`, the Typir services need to be initialized with `initializeLangiumTypirServices(langiumServices, langiumServices.typir)`.

The actual type system for your Langium-based language is defined as an implementation of the interface `LangiumTypeSystemDefinition`:

```typescript
export class MyDSLTypeSystem implements LangiumTypeSystemDefinition<MyDSLSpecifics> {
    onInitialize(typir: TypirLangiumServices<MyDSLSpecifics>): void {
      // define constant types and rules for conversion, inference and validation here
    }

    onNewAstNode(languageNode: AstNode, typir: TypirLangiumServices<MyDSLSpecifics>): void {
      // define types and their rules which depend on the current AST respectively the given AstNode (as parsed by Langium from programs written by users of your language) here
    }
}
```

`<MyDSLSpecifics>` is used to inform Typir-Langium about the generated DSL-specific TypeScript-types, which describe the current, DSL-specific AST:

```typescript
export interface MyDSLSpecifics extends TypirLangiumSpecifics {
    LanguageKeys: MyDSLAstType; // all AST types from the generated `ast.ts`
    // ... more could be customized here ...
}
```

## Additional APIs

Beyond the APIs inherited from Typir core, Typir-Langium provides some *additional APIs* to ease type checking with Typir in Langium projects.

This includes an API to register *validation rules* for `AstNode.$type`s, which is similar to the API of Langium for registering validation checks.
In contrast to the provided similar core API, `AstNode` might be used as key to register validation rules for all AST nodes.
By design, the keys are the `$type` values from the generated types in `ast.ts`.
Here is an excerpt from the LOX example:

```typescript
typir.validation.Collector.addValidationRulesForLanguageNodes({
    IfStatement: (node /* is of type IfStatement */, accept) => typir.validation.Constraints.ensureNodeIsAssignable(node.condition, typeBool, accept,
            () => ({ message: "Conditions need to be evaluated to 'boolean'.", languageProperty: 'condition' })),
    VariableDeclaration: ... ,
    // ...
});
```

All properties of `DiagnosticInfo` from Langium are supported in Typir-Langium when creating validation issues.
For example, this includes `data` to register code actions for validation issues which are created by Typir-Langium (see an example in LOX with test cases in `lox-type-checking-operators.test.ts`).
Note that the properties `node`, `property`, and `index` are named `languageNode`, `languageProperty`, and `languageIndex` in Typir and these names are used in Typir-Langium as well.


In similar way, it is possible to register *inference rules* for `AstNode.$type`s, as demonstrated in the LOX example:

```typescript
typir.Inference.addInferenceRulesForAstNodes({
    // ...
    VariableDeclaration: (languageNode /* is of type VariableDeclaration */) => {
        if (languageNode.type) {
            return languageNode.type; // the user declared this variable with a type
        } else if (languageNode.value) {
            return languageNode.value; // the user didn't declare a type for this variable => do type inference of the assigned value instead!
        } else {
            return InferenceRuleNotApplicable; // this case is impossible, there is a validation in the Langium LOX validator for this case
        }
    },
    Parameter: (languageNode /* is of type Parameter */) => languageNode.type,
    // ...
});
```


## Examples

Look at the examples in the `examples/` folder of the repo ([here](../../examples)). There we have some demo projects for you to get started, including LOX and OX.

## License

[MIT License](../../LICENSE)
