# Typir Change Log

We roughly follow the ideas of [semantic versioning](https://semver.org/).
Note that the versions "0.x.0" probably will include breaking changes.


## v0.2.0 (2025-??-??)

### New features

- Users of Typir are able to explicitly define sub-type relationships via the `SubTypeService.markAsSubType(subType, superType)` now (#58)
- Arbitrary paths of implicit conversion and sub-type relationships are considered for assignability now (#58)
- Control the behaviour in case of multiple matching overloads of functions (and operators) (#58)
- Moved the existing graph algorithms into its own dedicated service in order to reuse and to customize them (#58)
- New service `LanguageService` to provide Typir some static information about the currently type-checked language/DSL
- Associate validation rules with language keys for an improved performance
- Typir-Langium: new API to register validations to the `$type` of the `AstNode` to validate,
  e.g. `addValidationsRulesForAstNodes({ ReturnStatement: <ValidationRule1>, VariableDeclaration: <ValidationRule2>, ... })`, see (L)OX for some examples
- Associate inference rules with language keys for an improved performance
- Typir-Langium: new API to register inference rules to the `$type` of the `AstNode` to validate,
  e.g. `addInferenceRulesForAstNodes({ MemberCall: <InferenceRule1>, VariableDeclaration: <InferenceRule2>, ...})`, see (L)OX for some examples
- Thanks to the new chaining API for defining types (see corresponding breaking changes below), they can be annotated in TypeScript-type-safe way with multiple inference rules for the same purpose.

### Breaking changes

- `TypeConversion.markAsConvertible` accepts only one type for source and target now in order to simplify the API (#58): Users need to write `for` loops themselves now
- Methods in listeners (`TypeGraphListener`, `TypeStateListener`) are prefixed with `on` (#58)
- Reworked the API of validation rules to create validation hints: Instead of returning `ValidationProblem`s, they need to be given to the `ValidationProblemAcceptor` now, which is provided as additional argument inside validation rules.
- Reworked the API to add/remove validation rules in the `ValidationCollector` service:
  - Additional arguments need to be specified with an options object now
  - Unified validation API by defining `ValidationRule = ValidationRuleStateless | ValidationRuleWithBeforeAfter` and removed dedicated `add/removeValidationRuleWithBeforeAndAfter` methods accordingly
- Reworked the API to add/remove rules for type inference in the `TypeInferenceCollector` service:
  - Additional arguments need to be specified with an options object now
- Reworked the APIs to create types by introducing a chaining API to define optional inference rules. This counts for all provided type factories.
- Validations for the types of the arguments for function (and operator) calls need to be explicitly requested with the new property `validateArgumentsOfCalls` in the inference rules for calls now. In previous versions, these validations were active by default.
- The default Typir module was provided as `const DefaultTypirServiceModule`, now it is provided as `function createDefaultTypirServiceModule()`.

### Fixed bugs

- Clear the cache for inferred types, when an inference rule is removed.
- Remove removed functions from its internal storage in `FunctionKind`.
- Update the returned function type during a performance optimization, when adding or removing some signatures of overloaded functions.


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
