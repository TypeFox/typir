# Type relationships

Typir stores relationships as edges in the type graph. Assignability is computed from the others.

## Conversion

```typescript
typir.Conversion.markAsConvertible(typeInt, typeFloat, 'IMPLICIT_EXPLICIT'); // usable automatically, e.g. in assignments
typir.Conversion.markAsConvertible(typeFloat, typeInt, 'EXPLICIT');          // only via explicit casts
```

* `markAsConvertible` takes one source and one target type; call it once per pair.
* Implicit conversions are transitive (`int -> float -> string` makes `int` implicitly convertible to `string`) and must not form cycles.
* Explicit conversions are not transitive and may form cycles.
* Queries: `getConversion(from, to)` returns `'IMPLICIT_EXPLICIT' | 'EXPLICIT' | 'NONE' | 'SELF'`; `isImplicitExplicitConvertible`, `isExplicitConvertible`, `isConvertible` return booleans.
* Typir has no cast expression of its own. For a cast `x as T`, add an inference rule returning `T` and a validation rule checking `typir.Conversion.isConvertible(typeOfX, T)`.

## Subtyping

```typescript
typir.Subtype.markAsSubType(typeInt, typeNumber);
typir.Subtype.isSubType(typeInt, typeNumber);           // true
typir.Subtype.getSubTypeResult(typeString, typeNumber); // success or a problem explaining why not
```

* Subtyping is transitive. `markAsSubType` accepts `{ checkForCycles }`.
* Classes create subtype edges to their superclasses automatically. Top and bottom types are super and subtypes of everything. Custom kinds declare theirs via the `get*TypesOfNewCustomType` / `isNewCustomType*` hooks.
* Use subtyping for "is a" relationships and conversion for "can be turned into". Both make assignment legal, but they mean different things in error messages and in overload costs.

## Equality

`typir.Equality.areTypesEqual(a, b)` and `getTypeEqualityProblem(a, b)`. Types with the same identifier are the same object, so in most cases equality is identity. Otherwise each kind decides (for example structurally typed classes compare their fields).

## Assignability

`typir.Assignability.isAssignable(source, target)` is true when the types are equal, or when there is a path from source to target that consists of implicit conversions and subtype edges. For the reason behind a `false`:

```typescript
const result = typir.Assignability.getAssignabilityResult(source, target);
// or
const problem = typir.Assignability.getAssignabilityProblem(source, target);
if (problem) {
    console.log(typir.Printer.printTypirProblem(problem));
}
```

Assignability is what `ensureNodeIsAssignable` and overload resolution use, so getting conversion and subtyping right is usually the fix when assignments or calls are rejected unexpectedly.

## Caching

Relationship results are cached in `typir.caching.TypeRelationships`. You normally never need to touch it.
