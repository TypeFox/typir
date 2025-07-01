# Customize default implementations

This describes how the default implementations of Typir can be customized.
How to use custom types in Typir is described [in this section](./kinds/custom-types.md).

If you are already familar with Langium and its [strategies for customization](https://langium.org/docs/reference/configuration-services/#customization), feel free to skip this section, since the strategies and even the implementation are nearly the same.

As described in the [design section](./design.md), nearly all features of Typir are exposed by APIs in form of interfaces,
for which Typir provides classes implementing these interfaces as default implementations. These interfaces and implementations are composed in `typir.ts`.

TODO
