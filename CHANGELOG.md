# Typir Change Log

We roughly follow the ideas of [semantic versioning](https://semver.org/).
Note that the versions "0.x.0" probably will include breaking changes.


## v0.2.0 (upcoming)

### New features

- Users of Typir are able to explicitly define sub-type relationships via the `SubTypeService` (#58)
- Arbitrary paths of implicit conversion and sub-type relationships are considered for assignability now (#58)
- Control the behaviour in case of multiple matching overloads of functions (and operators) (#58)
- Moved the existing graph algorithms into its own dedicated service in order to reuse and to customize them (#58)
- New service `LanguageService` to provide Typir some static information about the currently type-checked language/DSL

### Breaking changes

- `TypeConversion.markAsConvertible` accepts only one type for source and target now in order to simplify the API (#58)
- Methods in listeners (`TypeGraphListener`, `TypeStateListener`) are prefixed with `on` (#58)


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
