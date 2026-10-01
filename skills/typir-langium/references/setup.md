# Setup and customization

## Contents

* Complete module wiring
* The specifics
* `createTypirLangiumServices` parameters
* Customizing and replacing services
* Adding your own services
* What Typir-Langium replaces in core Typir
* Order of type definitions

## Complete module wiring

This follows the generated Langium module layout. Only the lines marked `// typir` are new.

```typescript
import { inject, LangiumSharedCoreServices, Module } from 'langium';
import {
    createDefaultModule, createDefaultSharedModule, DefaultSharedModuleContext,
    LangiumServices, LangiumSharedServices, PartialLangiumServices
} from 'langium/lsp';
import { createTypirLangiumServices, initializeLangiumTypirServices, TypirLangiumServices } from 'typir-langium'; // typir
import { reflection } from './generated/ast.js'; // typir
import { MiniGeneratedModule, MiniGeneratedSharedModule } from './generated/module.js';
import { MiniSpecifics, MiniTypeSystem } from './mini-type-system.js'; // typir
import { MiniValidator, registerValidationChecks } from './mini-validator.js';

export type MiniAddedServices = {
    validation: { MiniValidator: MiniValidator },
    typir: TypirLangiumServices<MiniSpecifics>, // typir: every Langium service can use it, e.g. a ScopeProvider
};
export type MiniServices = LangiumServices & MiniAddedServices;

// the module needs the shared services, so it becomes a function
export function createMiniModule(shared: LangiumSharedCoreServices): Module<MiniServices, PartialLangiumServices & MiniAddedServices> {
    return {
        validation: { MiniValidator: () => new MiniValidator() },
        typir: () => createTypirLangiumServices(shared, reflection, new MiniTypeSystem()), // typir
    };
}

export function createMiniServices(context: DefaultSharedModuleContext): { shared: LangiumSharedServices, Mini: MiniServices } {
    const shared = inject(createDefaultSharedModule(context), MiniGeneratedSharedModule);
    const Mini = inject(createDefaultModule({ shared }), MiniGeneratedModule, createMiniModule(shared));
    shared.ServiceRegistry.register(Mini);
    registerValidationChecks(Mini);
    initializeLangiumTypirServices(Mini, Mini.typir); // typir: once, after registering the language
    return { shared, Mini };
}
```

Notes:

* If the module was a constant (`export const MiniModule = {...}`), turn it into a function of `shared`, because `createTypirLangiumServices` needs the shared services.
* `reflection` is the instance exported by the generated `ast.ts`. Passing the class, `undefined`, or the reflection of another language breaks language keys (see `rules-and-validation.md`).
* `initializeLangiumTypirServices(langiumServices, typirServices)` only needs `LangiumDefaultCoreServices`, so it also works for non LSP setups (CLI, tests, `createDefaultCoreModule`). It must not be deferred to the language server's `onInitialized`, since tests have no language server.
* Typir checks run in the order they are registered relative to your own checks. Registering your checks first keeps syntactic errors first in the list.

## The specifics

```typescript
export interface MiniSpecifics extends TypirLangiumSpecifics {
    AstTypes: MiniAstType; // generated in ast.ts
}
```

`TypirLangiumSpecifics` already fixes `LanguageType: AstNode` and extends `ValidationMessageProperties` with Langium's `DiagnosticInfo` (except `node`, `property`, `index`, which are called `languageNode`, `languageProperty`, `languageIndex` in Typir). You can add more properties to `ValidationMessageProperties` in your specifics if your messages need them. Use `interface ... extends` rather than `&`; intersections make TypeScript's checks of the batch registration APIs much weaker.

## `createTypirLangiumServices` parameters

```typescript
createTypirLangiumServices<Specifics>(
    langiumServices: LangiumSharedCoreServices,
    reflection: AbstractAstReflection,
    typeSystemDefinition: LangiumTypeSystemDefinition<Specifics>,
    customization1?: Module<PartialTypirLangiumServices<Specifics>>, // e.g. production
    customization2?: Module<PartialTypirLangiumServices<Specifics>>, // e.g. tests overriding production
    customization3?: Module<PartialTypirLangiumServices<Specifics>>,
    customization4?: Module<PartialTypirLangiumServices<Specifics>>,
): TypirLangiumServices<Specifics>
```

The customizations are dependency injection modules (like Langium modules), not option objects. They are applied in order, so a later one overrides an earlier one.

## Customizing and replacing services

Every service can be replaced. All default implementations are exported classes with `protected` members, meant to be subclassed.

```typescript
typir: () => createTypirLangiumServices(shared, reflection, new MiniTypeSystem(), {
    Printer: () => new MiniPrinter(),                                    // nicer type names in messages
    langium: {
        TypeCreator: (typir) => new MiniTypeCreator(typir),              // extends DefaultLangiumTypeCreator
    },
    validation: {
        TypeValidation: (typir) => new MiniTypirValidator(typir),        // extends DefaultLangiumTypirValidator
    },
    factory: {
        Functions: (typir) => new FunctionKind(typir, { /* kind options */ }),
    },
}),
```

Useful classes to extend: `DefaultLangiumTypeCreator` (when and how `onNewAstNode` is called), `DefaultLangiumTypirValidator` (how problems become Langium diagnostics), `LangiumProblemPrinter` (message texts), `LangiumLanguageService` (language keys), `LangiumLanguageNodeInferenceCaching` (inference cache).

## Adding your own services

```typescript
typir: () => createTypirLangiumServicesWithAdditionalServices<MiniSpecifics, MiniTypirAddedServices>(
    shared, reflection, new MiniTypeSystem(),
    { utils: { ClassHelper: (typir) => new ClassHelper(typir) } }, // implementations of the added services
    /* customization1..4 */
),
```

The services type in `MiniAddedServices` then becomes `TypirLangiumServices<MiniSpecifics> & MiniTypirAddedServices`.

## What Typir-Langium replaces in core Typir

* `Language` becomes `LangiumLanguageService(reflection)`: the key of a node is `node.$type`, supertypes come from the reflection, and `isLanguageNode` is Langium's `isAstNode`. There is no need to write your own `Language` service, unlike with core Typir.
* `Printer` becomes `LangiumProblemPrinter`: nodes are printed as `the AstNode '<source text>'`.
* `caching.LanguageNodeInference` becomes `LangiumLanguageNodeInferenceCaching`: cached per document, cleared when the document reaches `IndexedReferences` and when it is deleted.
* `Inference` and `validation.Collector` gain `addInferenceRulesForAstNodes` and `addValidationRulesForAstNodes`.
* New: `typir.langium.LangiumServices` (the shared Langium services), `typir.langium.TypeCreator`, `typir.langium.TypeSystemDefinition`, and `typir.validation.TypeValidation`.

## Order of type definitions

Typir tries to be independent of definition order, but is not there yet. In `onInitialize`:

1. Primitives, together with their inference rules for literals and for type reference nodes.
2. Operators.
3. Remaining inference rules (variables, parameters, references, parentheses).
4. Validation rules and built-in validations.

User declarations in `onNewAstNode` may appear in any order, and may reference each other (also cyclically); Typir delays the creation of a type until the types it depends on exist.
