# Validation

## Validation rules

A validation rule is a function `(node, accept, typir) => void`. Report problems by calling `accept`:

```typescript
typir.validation.Collector.addValidationRule((node, accept) => {
    if (isIfStatement(node)) {
        typir.validation.Constraints.ensureNodeIsAssignable(node.condition, typeBoolean, accept,
            actual => ({ message: `Conditions need to be boolean, but got '${actual.name}'.` }));
    }
});
```

When you call `accept` yourself, all of `languageNode`, `severity` (`'error' | 'warning' | 'info' | 'hint'`) and `message` are required. `languageProperty` and `languageIndex` can point at a specific property of the node, which helps editors place the marker.

```typescript
accept({ languageNode: node, languageProperty: 'name', severity: 'warning', message: 'Unused variable.' });
```

Register with options to restrict a rule to certain node types (requires a custom `Language` service, see `customization.md`):

```typescript
typir.validation.Collector.addValidationRule(rule, { languageKey: 'IfStatement' });
```

`removeValidationRule(rule, options)` needs the same options used for registration.

## Constraint helpers

`typir.validation.Constraints` covers the common checks. Each takes a source node, an expected type or node, `accept`, and a message provider:

| Method | Reports a problem when |
|---|---|
| `ensureNodeIsAssignable(node, expected, accept, msg)` | the node's type is not assignable to `expected` |
| `ensureNodeIsEquals(node, expected, accept, msg)` | the node's type is not equal to `expected` |
| `ensureNodeHasNotType(node, notExpected, accept, msg)` | the node's type equals `notExpected` |
| `ensureNodeRelatedWithType(node, expected, strategy, negated, accept, msg)` | general form; `strategy` is `'EQUAL_TYPE' \| 'ASSIGNABLE_TYPE' \| 'SUB_TYPE'` |

* `expected` may be a `Type` or another AST node, which is inferred (for example the declared variable in an assignment).
* The message provider receives `(actual, expected)`, each with `type`, `name`, and `userRepresentation`. It returns a partial problem; `languageNode` defaults to the checked node, `severity` defaults to `'error'`, and Typir provides a default `message`. The assignability details are attached as sub-problems automatically.
* If a node's type cannot be inferred, these helpers report nothing. Missing inference shows up as missing errors, so test inference separately.

## Validation that comes with types

* `validateArgumentsOfCalls: true` on operator rules and `validateArgumentsOfFunctionCalls: true` on function call rules turn on argument type checks for those calls.
* `validation: (...)` on any type-attached inference rule runs for every node that this rule inferred, receiving the inferred type. This is a good place for checks like "constructor called with the right number of arguments".

## Driving validation over an AST

`typir.validation.Collector.validate(node)` runs the rules for that single node only. Typir does not know your AST structure, so traverse it yourself:

```typescript
export function validateProgram(typir: TypirServices<MySpecifics>, root: Program): ValidationProblem<MySpecifics>[] {
    const problems: ValidationProblem<MySpecifics>[] = [];
    problems.push(...typir.validation.Collector.validateBefore(root));
    for (const node of streamAllNodes(root)) { // your own traversal
        problems.push(...typir.validation.Collector.validate(node));
    }
    problems.push(...typir.validation.Collector.validateAfter(root));
    return problems;
}
```

Call `validateBefore` and `validateAfter` only if lifecycle rules are registered, but calling them always is harmless and future proof.

## Lifecycle rules

For checks that need to see the whole program (uniqueness, cycles), register an object instead of a function:

```typescript
typir.validation.Collector.addValidationRule({
    beforeValidation: (root, accept, typir) => { /* reset state */ },
    validation: (node, accept, typir) => { /* collect */ },
    afterValidation: (root, accept, typir) => { /* report */ },
});
```

## Built-in validations

These are lifecycle rules, so they need `validateBefore`/`validateAfter`. Pass `registration: {}` (or rule options) to register them right away, or `registration: 'MYSELF'` to get the rule back and register it yourself.

```typescript
typir.factory.Functions.createUniqueFunctionValidation({ registration: {} });
typir.factory.Classes.createUniqueClassValidation({ registration: {} });
typir.factory.Classes.createUniqueMethodValidation({
    isMethodDeclaration: isMethodDeclaration,
    getClassOfMethod: method => method.$container,
    registration: {},
});
typir.factory.Classes.createNoSuperClassCyclesValidation({ isRelevant: isClassDeclaration, registration: {} });
```

## Reading results

Each `ValidationProblem` has `languageNode`, `severity`, `message`, and optional `subProblems`. `problem.message` is the short headline; `typir.Printer.printTypirProblem(problem)` gives the full explanation including sub-problems, which is what end users usually need to understand type mismatches.
