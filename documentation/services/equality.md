# Equality

Equality describes, whether two different types (e.g. types with different identifiers) are equal,
i.e. equal types behave in the same way from a typing point of view.

An example is an alias (or proxy) type, which is not the same type as its real (or base) type, but can be used interchangable without any difference.

Equality is a bidirection (or symmetric) and transitive relationship between two types.
By definition, a type is equal to itself.

## API

Equality is managed by the `TypeEquality` service available at `typir.Equality`.
The order of the given types `type1` and `type2` does not matter, since equality is a symmetric relationship.

```typescript
typir.Equality.areTypesEqual(type1: Type, type2: Type): boolean;
```

investigates whether the given types are equal.
The alternative call `getTypeEqualityProblem(...)` might provide some more details, why the given types are not equal.

```typescript
typir.Equality.markAsEqual(type1: Type, type2: Type): void;
```

allows to establish an equality relationships between two types.

## Default implementation

The default implementation stores equality relationships as `EqualityEdge` edges in the type graph.
Found transitive equality relationships are not cached.
