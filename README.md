# Typir

<div id="badges" align="center">

  [![npm](https://img.shields.io/npm/v/typir)](https://www.npmjs.com/package/typir)
  [![Build](https://github.com/TypeFox/typir/actions/workflows/actions.yml/badge.svg)](https://github.com/TypeFox/typir/actions/workflows/actions.yml)
  [![Github Discussions](https://img.shields.io/badge/github-discussions-blue?logo=github)](https://github.com/TypeFox/typir/discussions)
  [![Gitpod Ready-to-Code](https://img.shields.io/badge/Gitpod-ready--to--code-FFAE33?logo=gitpod)](https://gitpod.io/#https://github.com/TypeFox/typir)

</div>

---

Typir is a library for type systems and type checking for software languages in the web.

Typir is OpenSource, written in TypeScript, and follows pragmatic approaches for easing type checking in practical language engineering projects by providing default implementations for recurring problems.
As a stand-alone library, Typir provides a TypeScript-API for language engineers without an additional, external DSL for formalizing types.


## Core Features

Typir provides these core features:

- Predefined types: primitives, functions, classes, top, bottom (more are planned)
- Solutions for: circular type definitions, caching
- Meaningful and customizable error messages
- The provided default implementations are customizable by dependency injection

Typir does intentionally _not_ include ...

- rules engines and constraint solving
- formal proofs
- external DSLs for formalizing types


## NPM workspace

This repository is a NPM workspace. It contains the following packages:

- [Typir](./packages/typir/README.md) - the core package of Typir with default implementations for type checking services and some predefined types
- [Typir-Langium](./packages/typir-langium/README.md) - a binding of Typir for [Langium](https://github.com/eclipse-langium/langium), a language workbench for developing textual DSLs in the web,
in order to ease type checking for Langium-based languages

This repository contains the following stand-alone applications, which demonstrate how to use Typir for type checking:

- [LOX](./examples/lox/README.md) - static type checking for LOX, implemented with Typir-Langium
- [OX](./examples/ox/README.md) - a reduced version of LOX, implemented with Typir-Langium


## Tiny Typir Example

[TODO](/packages/typir/test/api-example.test.ts)


## Resources

Typir is presented in these talks:

- [LangDev'24](https://langdevcon.org/2024/program#26): [Video](https://www.youtube.com/watch?v=CL8EbJYeyTE), [slides](/resources/talks/2024-10-17-LangDev.pdf) (2024-10-17)
- [OCX/EclipseCon'24](https://www.ocxconf.org/event/778b82cc-6834-48a4-a58e-f883c5a7b8c9/agenda?session=23b97df9-0435-4fab-8a01-e0a9cf3e3831&shareLink=true): [Video](https://www.youtube.com/watch?v=WLzXAhcl-aY&list=PLy7t4z5SYNaRRGVdF83feN-_uHLwvGvgw&index=23), [slides](/resources/talks/2024-10-24-EclipseCon.pdf) (2024-10-24)


## Roadmap

The roadmap of Typir is organized with [milestones in GitHub](https://github.com/TypeFox/typir/milestones).

The roadmap include, among other, these features:

- More predefined types: structurally typed classes, lambdas, generics, constrained primitive types (e.g. numbers with upper and lower bound), ...
- Calculate types, e.g. operators whose return types depend on their current input types
- Optimized APIs to register rules for inference and validation

For the released versions of Typir, see the [CHANGELOG.md](/CHANGELOG.md).


## Contributing

Please read the [CONTRIBUTING.md](./CONTRIBUTING.md) for details on our code of conduct, and the process for submitting pull requests to us.

We also have a release process described in [RELEASE.md](./RELEASE.md).


## License

Typir is fully [MIT licensed](/LICENSE).
