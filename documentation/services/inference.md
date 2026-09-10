# Type inference

Type inference infers a Typir type for a given language node, i.e. it answers the question, which Typir type has a language node.
Therefore type inference is the central part which connects the type system and its type graph with an AST consisting of language nodes.
These relationships are defined with *inference rules*, which identify the Typir type for a given language node.


## API

The type inference service infers the type of a language node with this API call
and returns either the inferred type or an (maybe empty) array with reasons, why the type inference was not successful:

```typescript
typir.Inference.inferType(languageNode: Specifics['LanguageType']): Type | InferenceProblem[]
```

Inference rules can be registered with this API call (the `TypeInferenceRuleOptions` are the same as for [validation rules](../services/validation.md)):

```typescript
typir.Inference.addInferenceRule(rule: TypeInferenceRule, options?: TypeInferenceRuleOptions): void
```

It is possible to register multiple inference rules for language keys at once with this API:

```typescript
typir.Inference.addInferenceRulesForLanguageNodes(rules: InferenceRulesForLanguageKeys): void
```

The following example sketches, how to use this API, and shows its benefits regarding TypeScript safety (if `Specifics['LanguageKeys']` is specified):

```typescript
typir.Inference.addInferenceRulesForLanguageNodes({
  'VariableDeclaration': (languageNode /* is of type VariableDeclaration */) => languageNode.value,
  'VariableUsage': (languageNode /* is of type VariableUsage */) => languageNode.ref,
  // ...
});
```

## Default implementation

The default implementation collects all specified rules and evaluates them one after the other for type inference.
In case of multiple inference rules, later rules are not evaluated anymore, if an earlier rule already returned a type.

Usually there is no need to customize this default implementation.
