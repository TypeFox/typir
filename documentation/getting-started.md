# Getting started

This describes how to start implementing a type system with Typir.


## Typir (core)

To use Typir without any language workbench, e.g. for hand-written languages, models or system, use this [NPM package](https://www.npmjs.com/package/typir?activeTab=versions) in your project, which has no dependendies:

```bash
npm install typir
```

Afterwards, instantiate a new type system:

```typescript
const typir = createTypirServices<TypirSpecifics>();
```

If all nodes of your language AST have a common TypeScript super type (`MyDSLAstType`), concretize the given `<TypirSpecifics>`. This helps Typir to provide you an API with more accurate TypeScript types, since `unknown` would be the fall-back for all language nodes.

```typescript
interface MyDSLSpecifics extends TypirSpecifics {
    LanguageType: MyDSLAstType;
    // ... more could be customized here ...
}

const typir = createTypirServices<MyDSLSpecifics>();
```


This type system is going to be enriched now by types and relationships between the types according to the specifics of your language under development. All types and relationships are created using the type system instance `typir`, e.g.

```typescript
// create two primitive types
const numberType = typir.factory.Primitives.create({ primitiveName: 'number' }).finish();
const stringType = typir.factory.Primitives.create({ primitiveName: 'string' }).finish();

// specify a relationship between them: numbers are implicitly convertable to strings
typir.Conversion.markAsConvertible(numberType, stringType, 'IMPLICIT_EXPLICIT');

// ...
```


## Typir-Langium

To use Typir for a language developed with Langium, we recommend to use the dedicated Typir binding for Langium.
This [NPM package](https://www.npmjs.com/package/typir-langium?activeTab=versions) depends on Typir as well as on Langium.

```bash
npm install typir-langium
```

Languages often enable their users to define function-like or class-like elements
for which a corresponding Typir type in the type system needs to be created, see OX and LOX as examples.
These types depend on user input and need to be added or removed when the underlying Langium documents are added, removed or updated.

Therefore, the actual type system for your Langium-based language is defined as an implementation of the interface `LangiumTypeSystemDefinition`,
which separates constant types (and their rules) from user-dependent types (and their rules):

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

We recommend to integrate Typir as additional Langium service into your DSL, since this design enables all Langium services to use the Typir services for type checking:

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

`<MyDSLSpecifics>` is used to inform Typir-Langium about the generated DSL-specific TypeScript-types, which describe the current, DSL-specific AST. Note that `TypirLangiumSpecifics` extends the `TypirSpecifics` and already concretized `LanguageType` with `AstNode`.

```typescript
export interface MyDSLSpecifics extends TypirLangiumSpecifics {
    LanguageKeys: MyDSLAstType; // all AST types from the generated `ast.ts`
    // ... more could be customized here ...
}
```


## General suggestions

If your type system is small or does not need a lot of customization, a single `type-system.ts` file is enough. Otherwise a dedicated folder `type-system/` containing files like `type-system.ts`, `validation-rules.ts`, ... is usefull in practice.

