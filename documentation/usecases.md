# Use Cases

This describes how the main use cases of type systems are supported by Typir.
For all use cases you need to set-up Typir with all types and their relationships to each other,
including conversion rules and sub-type relationships.
Additionally, inference rules need to be added in order to describe, which language nodes have which Typir types.


## Set-up the type system

TODO

- create types
- establish relationships between types, e.g. conversion rules
- add inference rules
- (once vs for each user-defined type)


## Validation

The most obvious use case for type systems is to support type-related validations, e.g. to check in programming language-like languages,
that the initial value of a variable fits to its declared type or that only boolean-expressions are used as condition in if-statements.

Since such constraints usually always hold, corresponding validation checks are added once during the set-up of Typir.
For each validation check, a validation rule is created and registered in the `typir.validation.Collector` service.
After that, language nodes can be validated by the same service.
The result is a list of the found validation issues, which could be presented to the users of the language.

Read the documentation about [validations](./services/validation.md) to learn the technical details about validations.


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
