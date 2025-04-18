# Typir Change Log

We roughly follow the ideas of [semantic versioning](https://semver.org/).
Note that the versions "0.x.0" probably will include breaking changes.


## v0.2.1 (2025-04-09)

- Export `test-utils.ts` which are using `vitest` via the new namespace `'typir/test'` in order to not pollute production code with vitest dependencies (#68)


## v0.2.0 (2025-03-31)

### New features

- Users of Typir are able to explicitly define sub-type relationships via the `SubTypeService.markAsSubType(subType, superType)` now (#58)
- Arbitrary paths of implicit conversion and sub-type relationships are considered for assignability now (#58)
- Control the behaviour in case of multiple matching overloads of functions (and operators) (#58)
- Moved the existing graph algorithms into its own dedicated service in order to reuse and to customize them (#58)
- New service `LanguageService` to provide Typir some static information about the currently type-checked language/DSL (#64)
- Associate validation rules with language keys for an improved performance (#64)
- Typir-Langium: new API to register validations to the `$type` of the `AstNode` to validate,
  e.g. `addValidationsRulesForAstNodes({ ReturnStatement: <ValidationRule1>, VariableDeclaration: <ValidationRule2>, ... })`, see (L)OX for some examples (#64)
- Associate inference rules with language keys for an improved performance (#64)
- Typir-Langium: new API to register inference rules to the `$type` of the `AstNode` to validate,
  e.g. `addInferenceRulesForAstNodes({ MemberCall: <InferenceRule1>, VariableDeclaration: <InferenceRule2>, ...})`, see (L)OX for some examples (#64)
- Thanks to the new chaining API for defining types (see corresponding breaking changes below), they can be annotated in TypeScript-type-safe way with multiple inference rules, e.g. multiple inference rules for class literals with `typir.factory.Classes.create({...}).inferenceRuleForClassLiterals({...}).inferenceRuleForClassLiterals({...}).finish();` (#64).
- Provide new `expectValidationIssues*(...)` utilities for developers to ease the writing of test cases for Typir-based type systems (#64).
- Create the predefined validations using the factory API, e.g. `typir.factory.Functions.createUniqueFunctionValidation()` and `typir.factory.Classes.createNoSuperClassCyclesValidation()`, see LOX for examples. Benefits of this design decision: the returned rule is easier to exchange, users can use the known factory API with auto-completion (no need to remember the names of the validations) (#64)
- Updated Langium-Typir to Langium v3.4 (#65)

### Breaking changes

- `TypeConversion.markAsConvertible` accepts only one type for source and target now in order to simplify the API (#58): Users need to write `for` loops themselves now
- Methods in listeners (`TypeGraphListener`, `TypeStateListener`) are prefixed with `on` (#58)
- Reworked the API of validation rules to create validation issues: Instead of returning `ValidationProblem`s, they need to be given to the `ValidationProblemAcceptor` now, which is provided as additional argument inside validation rules (#64).
- Reworked the API to add/remove validation rules in the `ValidationCollector` service (#64):
  - Additional arguments need to be specified with an options object now
  - Unified validation API by renaming and defining `ValidationRule = ValidationRuleFunctional | ValidationRuleLifecycle` and removed dedicated `add/removeValidationRuleWithBeforeAndAfter` methods accordingly
- Reworked the API to add/remove rules for type inference in the `TypeInferenceCollector` service (#64):
  - Additional arguments need to be specified with an options object now
- Reworked the APIs to create types by introducing a chaining API to define optional inference rules. Don't forget to call `.finish();` at the end in order to complete the definition and to create the defined type! Typir will not inform you about forgotten calls of `finish()`! This counts for all provided type factories (#64).
- Validations for the types of the arguments for function (and operator) calls need to be explicitly requested with the new property `validateArgumentsOfCalls` in the inference rules for calls now. In previous versions, these validations were active by default (#64).
- The default Typir module was provided as `const DefaultTypirServiceModule`, now it is provided as `function createDefaultTypirServiceModule()` (#64).
- Most parts of Typir have the additional `<LanguageType>` generic in order to replace `unknown` by your current `LanguageType` (#64).
  - Use the base type of your AST node implementations as `LanguageType`, e.g. `AstNode` in Typir-Langium or `TestLanguageNode` for the internal test cases of Typir.
  - Therefore, your `LanguageType` might need to be sometimes specified, e.g. for `createDefaultTypirServiceModule<LanguageType>(...)` and `createTypirServices<LanguageType>(...)`.
- The management of services, modules and instantiations in Typir-Langium is reworked (#65):
  - The Langium-specific service `TypeCreator` is moved into the new group `langium`, which groups all new Langium-specific services.
  - Typir modules which are specific for Langium have the new generic type `<AstTypes extends LangiumAstTypes>` now, the expected `AstTypes` are generated by Langium in the `ast.ts` files, e.g. use `<LoxAstType>` in the LOX example.
  - The `LangiumTypeCreator` interface is split into two services: The new one is called `LangiumTypeSystemDefinition` and contains the definitions of the language-specific type system (this simplifies the definition of the type system, see e.g. `ox-type-checking.ts` and `lox-type-checking.ts`). The existing `LangiumTypeCreator` service focuses on integrating the `LangiumTypeSystemDefinition` into the Langium build infrastructure only.
  - Use the new utility `createTypirLangiumServices(...)` to integrate Typir-Langium into your Langium module (which is usually done in `*-module.ts`). The existing utility `createLangiumModuleForTypirBinding` is removed.
  - Some renamings in `typir-langium.ts`: `createDefaultTypirLangiumServices()` to `createDefaultTypirLangiumServicesModule()`, `TypirLangiumServices` to `TypirLangiumAddedServices`, `LangiumServicesForTypirBinding` to `TypirLangiumServices`
- Renamed utility function `createDefaultTypirServiceModule` to `createDefaultTypirServicesModule` in `typir.ts` (#65).
- Renamed the test utility `assertType` to `assertTypirType` in order to prevent accidental name collisions with `assertType` from `vitest` (#65).

### Fixed bugs

- Clear the cache for inferred types, when an inference rule is removed, since the inferred type might be produced by the removed inference rule (#64).
- Remove removed functions from its internal storage in `FunctionKind` (#64).
- Update the returned function type during a performance optimization, when adding or removing some signatures of overloaded functions (#64).
- When inferring the types of accessing fields of classes, the properties `filter` and `match` were ignored (#64).
- The inference logic in case of zero arguments (e.g. for function calls or class literals) was not accurate enough (#64).


## v0.1.2 (2024-12-20)

- Replaced absolute paths in READMEs by relative paths, which is a requirement for correct links on NPM
- Edit: Note that the tag for this release was accidentally added on the branch `jm/v0.1.2`, not on the `main` branch.


## v0.1.1 (2024-12-20)

- Improved the READMEs in the packages `typir` and `typir-langium`.
- Improved the CONTRIBUTING.md.
- Improved source code for Tiny Typir in `api-example.test.ts`.


## v0.1.0 (2024-12-20)

This is the first official release of Typir.
It serves as first version to experiment with Typir and to gather feedback to guide and improve the upcoming versions. We are looking forward to your feedback!

- [Linked issues and PRs](https://github.com/TypeFox/typir/milestone/2)
- Core implementations of the following [type-checking services](./packages/typir/src/services/):
  - Assignability
  - Equality
  - Conversion (implicit/coercion and explicit/casting)
  - Type inference
  - Sub-typing
  - Validation
  - Caching
- [Predefined types](./packages/typir/src/kinds/) to reuse:
  - Primitives
  - Functions (with overloading)
  - Classes (nominally typed)
  - Top, bottom
  - (some more are under development)
  - Operators (which are mapped to Functions, with overloading)
- Application examples:
  - LOX (without lambdas)
  - OX
