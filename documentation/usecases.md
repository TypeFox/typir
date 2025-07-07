# Use Cases

This describes how the main use cases of type systems are supported by Typir.
For all use cases you need to set-up Typir with all types and their relationships to each other,
including conversion rules and sub-type relationships.
Additionally, inference rules need to be added in order to describe, which language nodes have which Typir types.


## Set-up the type system

TODO


## Validation

TODO


## Linking

TODO


## Language processing

Typical examples for language processing include generators and interpreters,
which get an AST consisting of language nodes as input and produce some output.
Often the assumption for language processing is,
that the AST is correctly linked and no (critical) validation issues are existing (see the two use cases before).

TODO type inference with the [type inference service](./services/inference.md)

If you transpile or compile programming language-like languages,
implicit and explicit conversions of values to variables or parameters often need to be handled.
Here the [assignability service](./services/assignability.md) helps you to get information, how types are converted to each other:

```typescript
typir.Assignability.getAssignabilityResult(source: Type, target: Type): AssignabilityResult
```

The `AssignabilityResult` describes the assignability path between source and target types
including implicit conversions, explicit conversions, equality and sub-type relationships.
The language processor could for example identify the implicit conversions and generate explicit conversion utility procedures in the generated output.
