# Custom types

Many languages contain features which cannot be easily described with the predefined types.
This describes how language-specific custom types can be defined and used in Typir.


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
const matrixFactory = new CustomKind<MatrixType, TestLanguageNode>(typir, {
    name: 'Matrix',
    calculateTypeName: properties => `My${properties.width}x${properties.height}Matrix`,
    // ... here you can specify additional rules for conversion, sub-types, ... for all matrix types ...
});
```

Now you can use this factory to create new matrix types:

```typescript
const matrix2x3 = matrixFactory
    .create({ properties: { baseType: integerType, width: 2, height: 3 } })
    .finish().getTypeFinal()!;
```

See `custom-example-restricted.test.ts` for another application example.


## Features

This sections describes the features of custom types in more detail.

### Custom properties

Custom types have custom properties ("data") including primitive values, Typir types and nesting/grouping with sets, arrays, and maps, and recursion.
See `custom-nested-properties.test.ts` for some examples.
When the initialization of the custom type is done, all its properties are read-only.

### Support by the TypeScript compiler

The API for custom types uses TypeScript generics to enable TypeScript-safe descriptions for these custom properties.
In the example above, calling `matrix2x3.properties.width` is supported by auto-completion in the IDE and will return the number `2`.

### Uniqueness

Typir ensures uniqueness for custom types.
Two custom types are identical, if their identifiers are the same (this counts for any type, not only for custom types).
The default implementation calculates the identifier by concatenating the values of all properties.

### Circular dependencies

Cyclic dependencies of the given types for type properties are handled by Typir.
See some examples in `custom-cycles.test.ts` and `custom-selectors.test.ts`.
Therefore `getTypeFinal()` needs to be called after finishing a new custom type, e.g. `const myCustomType = customKind.create({...}).finish().getTypeFinal();`.
If the custom type is already available, you will get your `CustomType<Properties, LanguageType>`, otherwise `undefined`.
If the type is not yet available, you can register a callback, which is called, when the type is available:

```typescript
customKind.create({...}).finish().addListener(finishedType => {
  // here the new custom type is available and can be used as usual
  finishedType.getIdentifier();
});
```

### Behaviour

Specify rules for conversion, sub-type, names, identifiers, inference and validation (usually for all custom types OR for single ones).
See `custom-example-restricted.test.ts` for some examples.

### Multiple different custom types

You can use different factories for different custom types in parallel within the same Typir instance.
See `custom-independent.test.ts` for an example.


## Limitations

- You cannot use simple string values for `TypeSelector`s (in order to specify custom properties of type `Type`), since they cannot be distinguished from string values for primitive custom properties.
  Therefore, only the restricted `TypeSelectorForCustomTypes` is supported by custom types instead of the usual `TypeSelector`.
- Even if your custom type does not depend on other types or if you know, that the types your custom type depends on are already available,
  you need to call `getTypeFinal()`, e.g. `const myCustomType = customKind.create({...}).finish().getTypeFinal()!;`.
