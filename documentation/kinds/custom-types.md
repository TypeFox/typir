# Custom types

Many languages contain features which cannot be easily described with the predefined types.
This section describes how language-specific custom types can be defined and used in Typir.


## API by example

This section demonstrates the API to define custom types along the example extracted from `custom-example-matrix.test.ts`. Here a new mathematical matrix type is defined with `width` and `height`, which is similar to a two-dimensional array. The content of cells are primitive types.

First of all, you need to specify the properties of matrix types in Typir by creating a TypeScript type (note that `interface` instead of `type` does not work):

```typescript
type MatrixType = {
    baseType: PrimitiveType;
    width: number;
    height: number;
};
```

Then you create a new factory for these matrix types:

```typescript
const matrixFactory = new CustomKind<MatrixType, TestingSpecifics>(typir, {
    name: 'Matrix',
    // ... here you can specify some optional rules for type names, conversion, sub-types, ... for all matrix types:
    calculateTypeName: properties => `My${properties.width}x${properties.height}Matrix`,
});
```

Now you can use this factory to create new matrix types:

```typescript
const matrix2x3 = matrixFactory
    .create({ properties: { baseType: integerType, width: 2, height: 3 } })
    .finish().getTypeFinal()!;
```

See `custom-example-restricted.test.ts` for another application example.

In order to provide the matrix factory like the other predefined factories for primitives, functions and so on,
read the [section about customization](../customization.md), summarized as follows:

```typescript
// define your custom factory as additional Typir service
type AdditionalMatrixTypirServices = {
    readonly factory: {
        readonly Matrix: CustomKind<MatrixType, TestingSpecifics>;
    }
}

// specify the additional services as TypeScript generic when initializing the Typir services and provide the custom factory
const typir = createTypirServicesWithAdditionalServices<TestingSpecifics, AdditionalMatrixTypirServices>({
    factory: {
        Matrix: services => new CustomKind<MatrixType, TestingSpecifics>(services, { ... })
    }
});

// now the custom matrix factory is usable like the predefined factories
typir.factory.Matrix.create({ ... }).finish().getTypeFinal()!;
```


## Features

This sections describes the features of custom types in more detail.

### Custom properties

Custom types have custom properties ("data") including primitive values, Typir types and nesting/grouping with sets, arrays, and maps, and recursion.
See `custom-nested-properties.test.ts` for some examples.
It is also possible to mark properties as optional with the `?` operator (see `custom-optional-properties.test.ts` for an example).
When the initialization of the custom type is done, all its properties are read-only.

### Support by the TypeScript compiler

The API for custom types uses TypeScript generics to enable TypeScript-safe descriptions for these custom properties.
In the example above, calling `matrix2x3.properties.width` is supported by auto-completion in the IDE and will return the number `2`.

### Uniqueness

Typir ensures uniqueness for custom types.
Two custom types are identical, if their identifiers are the same (this counts for any type, not only for custom types, see the [general design](../design.md) for types).
The default implementation calculates the identifier by concatenating the values of all properties and therefore provides a sufficient default solution.
Nevertheless, it is possible to customize the calculation of identifiers (`calculateTypeIdentifier`), e.g. to improve their readability.

### Circular dependencies

Circular dependencies of the given types for type properties are handled by Typir.
See some examples in `custom-cycles.test.ts` and `custom-descriptors.test.ts`.
Therefore `getTypeFinal()` needs to be called after finishing a new custom type, e.g. `const myCustomType = customKind.create({...}).finish().getTypeFinal();`.
If the custom type is already available, you will get your `CustomType<Properties, TestingSpecifics>`, otherwise `undefined`.
If the type is not yet available, you can register a callback, which is called, when the type is available:

```typescript
customKind.create({...}).finish().addListener(finishedType => {
  // here the new custom type is available and can be used as usual
  finishedType.getIdentifier();
});
```

### Behaviour

It is possible to specify rules for conversion, sub-type, names, identifiers, inference and validation, usually for all custom types OR for single ones.
See `custom-example-restricted.test.ts` for some examples.

### Multiple different custom types

You can use different factories for different custom types in parallel within the same Typir instance.
See `custom-independent.test.ts` for an example.


## Limitations

- You cannot use simple string values for `TypeDescriptor`s (in order to specify custom properties of type `Type`), since they cannot be distinguished from string values for primitive custom properties.
  Therefore, only the restricted `TypeDescriptorForCustomTypes` is supported by custom types instead of the usual `TypeDescriptor`.
  As a workaround for the identifier `'MyIdentifier'`, use `() => 'MyIdentifier'` instead.
- Even if your custom type does not depend on other types or if you know, that the types your custom type depends on are already available,
  you need to call `getTypeFinal()`, e.g. `const myCustomType = customKind.create({...}).finish().getTypeFinal()!;`.
