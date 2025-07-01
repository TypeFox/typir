# Assignability

Assignability checks whether a source type is assignable to a target type or not. Assignability is used for the following use cases, among others:

- Assignment statements, e.g. `targetVariable := sourceValue;`: Assignability checks whether the type of the given source value type-wise matches the type of the target variable.
- Variable initialization, e.g. `var newVariable: VariableType := initialValue;`: Assignability checks whether the type of the initial value matches the explicitly declared type of the new variable.
- Calling functions and operators with arguments, e.g. `myFunction(inputArgument)`: Assignability checks whether the type of a given arguments matches the expected type of the corresponding parameter.


## API

The assignability service informs, whether a source type is assignable to a target type:

```typescript
typir.Assignability.isAssignable(source: Type, target: Type): boolean
```


## Default implementation

The default implementation exploits the following relationships between types:

- equality
- implicit conversion (but no explicit conversion / casting)
- sub-type relationships


## Result of assignability: Chain of assignability

If you are interested in more details, why types are assignable or why two types are not assignable, use the following more advanced API to get a result object, which gives some more information:

```typescript
typir.Assignability.getAssignabilityResult(source: Type, target: Type): AssignabilityResult;

type AssignabilityResult = AssignabilitySuccess | AssignabilityProblem;

interface AssignabilitySuccess {
    //...
    result: true;
    path: Array<SubTypeEdge | ConversionEdge>;
}

interface AssignabilityProblem extends TypirProblem {
    //...
    result: false;
    subProblems: TypirProblem[];
}
```

In case of no assignability, you will get an `AssignabilityProblem`, whose `subProblems` might list some found problems.

In case of assignability, you will get an `AssignabilitySuccess`, which contains a `path` of edges found in the type graph,
which starts at the source type and ends at the target type.
The edges represent equality, an existing sub-type relationship or an implicit conversion between the current type to the next type.
If source type and target type are the same, an empty path is returned.
