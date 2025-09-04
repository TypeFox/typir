# Validation

Typir provides some services and concepts, to create validation checks, which check some type-related constraints on language nodes.

## API

### Validation rules

Validation rules are single checks, which are executed on a given language node and result in an arbitrary number of validation issues.
Simple validation rules are realized as TypeScript functions:

```typescript
type ValidationRuleFunctional = (languageNode: LanguageType, accept: ValidationProblemAcceptor, typir: TypirServices) => void;
```

The given `languageNode` is the starting point for doing some type-related checks on the AST.
Found validation issues are not returned, but reported to the `ValidationProblemAcceptor` by calling it with `accept({ ... })`.
The properties to specify in the given object are described in the next section.

To realize more advanced checks in more performant way, there is also `ValidationRuleLifecycle`.

### Validation collector

The `ValidationCollector` is the central place for managing the validation.
Validation rules are registered at and collected by the validation collector with `typir.validation.Collector.addValidationRule(rule, { ... })`.
Some options might be given in the options object as second argument:

- `boundToType`: If the given type is removed from the type system, this rule will be automatically removed as well.
- `languageKey`: By default, all validation rules are performed for all language nodes.
  In order to improve performance, validation rules with a given language key are executed only for language nodes with this language key.

The call `const issues: ValidationProblem = typir.validation.Collector.validate(languageNode)` validates a language node
by executing all validation rules which are applicable to the given language node and returns all found validation issues.
Since Typir doesn't know the structure of the AST, there is *no* automatic traversal of the AST, i.e. *only* the given language node is validated.

Bindings of Typir for concrete language workbenches might behave differently,
e.g. Typir-Langium hooks into the regular validation mechanisms of Langium.
Therefore neither direct calls of `validate()` nor traversals of the Langium AST are required.

### Validation issues

When reporting some issues, different information can be reported.
All values are put into an object representing the validation issue.
This validation issue object is given to the validation problem acceptor, e.g.

```typescript
accept({
    severity: 'error',
    message: 'An error occurred',
    languageNode: myCheckedNode,
    // ...
});
```

The following properties are supported by default by Typir (core):

* The `severity` describes, how critical the found issue is, e.g. whether its an error or only a hint.
* The `message` is some text to describe the issue in a human-readable way.
* Optionally, `subProblems` allows to attach some sub-problems, which might give some more details or reasons for the reported validation issue.
* The `languageNode` can be used to specify, where in the validation issue occurred in the validated AST. This "source of the issue" might be different than the language node which was given as input to the validation rule.
* A `languageProperty` can be specified only, if the `languageNode` is specified, and marks a property as more fine-grained source of the issue.
* The `languageIndex` makes only sense, if the `languageProperty` is specified, and gives even more details for the source of the issue.

The available properties can be customized via `TypirSpecifics['ValidationMessageProperties']`, which is useful for supporting new language workbenches.
Don't forget to store or apply the values for the customized properties,
which requires some more customizations when postprocessing the validtion issues returned by Typir.
As an example, Typir-Langium provides some properties for validation issues, which are specific for Langium.

### Predefined constraints

To simplify the checking and creating of validation issues,
the `ValidationConstraints` service available via `typir.validation.Constraints` provides some constraints as short-cuts for recurring validation checks,
which can be used inside validation rules.

As an example, if you have a `node` which represents a `VariableDeclaration`, you could validate, whether the given initial `value` is assignable to the declared `type` of the variable in this way:

```typescript
typir.validation.Constraints.ensureNodeIsAssignable(
  node.value, // the initial value, its Typir type is inferred internally
  node.type, // the declared (language) type, the corresponding Typir type is inferred internally
  accept, // the validation acceptor
  (actual, expected) => ({ // callback to create a meaningful validation issue, if the value does not fit to the type
    message: `The initial value of type '${actual.name}' is not assignable to '${node.name}' of type '${expected.name}'.`,
    // more properties might be specified
  })
);
```

See (L)OX for some more examples.
