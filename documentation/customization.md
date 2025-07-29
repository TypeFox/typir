# Customize Typir

This describes how the default behaviour of Typir can be customized.
How to use custom types in Typir is described [in this section](./kinds/custom-types.md).

If you are already familar with Langium and its [strategies for customization](https://langium.org/docs/reference/configuration-services/#customization), feel free to skip this section, since the strategies and even the implementation are nearly the same.

As described in the [design section](./design.md), nearly all features of Typir are exposed by APIs in form of interfaces,
for which Typir provides classes implementing these interfaces as default implementations. These interfaces and implementations are composed in ...

- `typir.ts` for Typir (core)
- `typir-langium.ts` for Typir-Langium

Some examples how to customize existing services and how to add new services are sketched in `customization-example.test.ts`.


## Customize the implementation of existing services

To customize or replace the default implementation for an existing Typir service, just provide another implementation when initializing the Typir services.
As an example, the existing factory to create classes is replaced to allow two super classes now (default is one super class only):

```typescript
const customizedTypir = createTypirServices({
    factory: {
        Classes: services => new ClassKind(services, { maximumNumberOfSuperClasses: 2 }),
    },
    // ... customize as many existing services as you like ...
});
```

## Add additional services

Additional services need to be explicitly specified.
In general, you can add an arbitrary number of services, which might be deeply grouped.
It is even possible to add new services to already existing groups.
In the following example, an additional factory for classes is exposed as service:

```typescript
type AdditionalExampleTypirServices = {
    readonly factory: {
        readonly OtherClasses: ClassFactoryService<TestLanguageNode>;
    },
};
```

Mark new services with the keyword `readonly` to prevent changing them at runtime, since they are instantiated only once when they are used for the first time.
Specify implementations for all added services which are considered when you instantiate the Typir services.
Instead of `createTypirServices`, use `createTypirServicesWithAdditionalServices` instead and specify the new services as generic (here `<..., AdditionalExampleTypirServices>`):

```typescript
const customizedTypir: TypirServices<TestLanguageNode> & AdditionalExampleTypirServices = createTypirServicesWithAdditionalServices<TestLanguageNode, AdditionalExampleTypirServices>({
    factory: {
        OtherClasses: services => new ClassKind(services, { maximumNumberOfSuperClasses: 2, $name: 'OtherClass' }),
    },
});
```

TypeScript doesn't force you to write `TypirServices<TestLanguageNode> & AdditionalExampleTypirServices` in the code snipped above, but makes explicit what is going on here:
You get the `TypirServices` as usual, but they are combined with your defined `AdditionalExampleTypirServices`, i.e. you get only one object back containing default and custom services. Additionally, both default and custom services are correctly TypeScript-typed.

To simplify the code, it is recommended (but not mandatory) to introduce a TypeScript type like the following and to use it instead, since it makes explicit that the current Typir services are customized:

```typescript
type ExampleTypirServices = TypirServices<TestLanguageNode> & AdditionalExampleTypirServices;
```

Newly added services are usable by all other services, including new services and existing services.
The latter is important when customizing default implementations, when the custom implementation depends on the new services.

It is possible to provide implementations for new services together with customizations for existing services:

```typescript
const customizedTypir: ExampleTypirServices = createTypirServicesWithAdditionalServices<TestLanguageNode, AdditionalExampleTypirServices>({
    // 1st mandatory argument: implementations for all new services
}, {
    // 2nd optional argument: customize some (existing or new) services here
}, /* even more arguments for even more customizations for services are possible here */);
```
