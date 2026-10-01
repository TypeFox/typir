# Rules and validation in a Langium language

## Contents

* Language keys
* Batch registration
* Primitives and type references
* Operators in a Langium grammar
* Validation rules and how they reach Langium
* Message properties
* Built-in unique and cycle validations
* Code actions for Typir problems

## Language keys

The language key of an AST node is its `$type`. Use the generated constants (`BinaryExpr.$type`) instead of strings, because a misspelled key fails silently.

```typescript
typir.factory.Primitives.create({ primitiveName: 'int' })
    .inferenceRule({ languageKey: IntLit.$type })
    .finish();
```

How Typir picks rules for a node:

1. Rules registered for the node's exact `$type`.
2. Rules registered for its supertypes from the AST reflection (for example a rule for `Expr` applies to `BinaryExpr`, `Ref`, and every other node whose grammar rule `infers Expr`, as well as for union types like `type NamedElement = VarDecl | Param`).
3. Rules without a key (`filter` only, or the key `AstNode`).

For inference, the first rule that returns a type wins. For validation, all matching rules run. `languageKey` also accepts an array of keys.

`filter` still works (for example `filter: isBoolLit`), but runs for every node and after all keyed rules. Prefer `languageKey` plus `matching` for performance and predictable ordering.

## Batch registration

```typescript
typir.Inference.addInferenceRulesForAstNodes({
    // a reference has the type of what it points to (calls are handled by the function types)
    Ref: (node) => {
        const target = node.target.ref;
        if (isVarDecl(target)) {
            return target;               // delegate to the declaration
        } else if (isParam(target)) {
            return target.type;          // delegate to the type reference
        }
        return InferenceRuleNotApplicable; // functions or unresolved references
    },
    VarDecl: (node) => node.type ?? node.value ?? InferenceRuleNotApplicable,
    Param: (node) => node.type,
});

typir.validation.Collector.addValidationRulesForAstNodes({
    IfStmt: (node, accept, typir) => typir.validation.Constraints.ensureNodeIsAssignable(node.condition, typeBool, accept,
        () => ({ message: "Conditions need to be evaluated to 'bool'.", languageProperty: 'condition' })),
    VarDecl: [ruleA, ruleB], // several rules for one key
});
```

The keys are checked against `AstTypes` of your specifics. The key `AstNode` means "every node". The third parameter of a validation rule is typed as core `TypirServices`; capture the `TypirLangiumServices` in a closure if a rule needs `typir.langium`.

Register these only in `onInitialize`. Rules added here are global and are never removed; adding them in `onNewAstNode` registers them again on every rebuild.

## Primitives and type references

Each primitive needs a rule for its literal and a rule for type reference nodes in the grammar, so that declared types (`let x: int`) infer the primitive:

```typescript
const typeInt = typir.factory.Primitives.create({ primitiveName: 'int' })
    .inferenceRule({ languageKey: IntLit.$type })
    .inferenceRule({ languageKey: TypeRef.$type, matching: (node: TypeRef) => node.primitive === 'int' })
    .finish();
```

Primitives are the right place for `null` or `nil` as well; make it assignable to class types later (see `user-defined-types.md`).

## Operators in a Langium grammar

Langium grammars usually produce one node type for all binary operators (`{infer BinaryExpr.left=current} op=... right=...`). Write one rule and reuse it for every operator:

```typescript
const binaryRule: InferOperatorWithMultipleOperands<MiniSpecifics, BinaryExpr> = {
    languageKey: BinaryExpr.$type,
    matching: (node: BinaryExpr, name: string) => node.op === name,
    operands: (node: BinaryExpr) => [node.left, node.right],
    validateArgumentsOfCalls: true, // otherwise wrong operand types are not reported
};
for (const op of ['+', '-', '*', '/']) {
    typir.factory.Operators.createBinary({ name: op, signature: { left: typeInt, right: typeInt, return: typeInt } })
        .inferenceRule(binaryRule).finish();
}
typir.factory.Operators.createBinary({ name: '==', signatures: [
    { left: typeInt, right: typeInt, return: typeBool },
    { left: typeBool, right: typeBool, return: typeBool },
] }).inferenceRule(binaryRule).finish();
```

An operator rule may add its own `validation` callback, for example a warning for comparisons of different types:

```typescript
.inferenceRule({
    ...binaryRule,
    validation: (node, _name, _type, accept, typir) => typir.validation.Constraints.ensureNodeIsEquals(node.left, node.right, accept,
        (actual, expected) => ({ message: `Comparing '${actual.name}' with '${expected.name}' is always false.`, languageNode: node, severity: 'warning' })),
})
```

If both `+` on strings and `+` on ints exist, use `signatures: [...]` on a single `createBinary` call, so overload resolution sees both.

## Validation rules and how they reach Langium

`initializeLangiumTypirServices` registers three things with Langium's `ValidationRegistry`:

* one check for **every** `AstNode`, which runs all Typir validation rules applicable to that node (category `fast`, so it runs on every change in the editor),
* a before document hook (`validateBefore`) and an after document hook (`validateAfter`), which drive lifecycle validations such as the unique checks below.

Each Typir problem becomes one Langium diagnostic. The message is produced by the printer:

```
While validating the AstNode 'x = "a"', this error is found: The expression '"a"' of type 'string' is not assignable to 'x' with type 'int'
```

Nested sub-problems (for example why assignability failed) are appended on further lines. Your own message is in the middle, so assert on substrings in tests.

Constraint helpers (`ensureNodeIsAssignable`, `ensureNodeIsEquals`, `ensureNodeHasNotType`) report nothing when the type of either side cannot be inferred. That avoids follow-up errors, but it also hides missing inference rules.

## Message properties

```typescript
(actual, expected) => ({
    message: `'${actual.name}' is not assignable to '${expected.name}'.`, // actual/expected are { type, name, userRepresentation }
    languageNode: node,           // which node to mark (default: the validated node)
    languageProperty: 'value',    // which property of that node to mark (untyped string, check spelling)
    languageIndex: 0,             // for list properties
    severity: 'error',            // default; or 'warning', 'info', 'hint'
    // Langium DiagnosticInfo extras:
    keyword: 'let', range, code: 'type-mismatch', tags, relatedInformation,
    data: diagnosticData('type-mismatch'), // for code actions
})
```

## Built-in unique and cycle validations

These are lifecycle rules, which work through the before and after document hooks.

```typescript
// unique function names (by name and parameter types)
typir.factory.Functions.createUniqueFunctionValidation({ registration: { languageKey: FunDecl.$type } });

// unique class names: 'MYSELF' means "I register the returned rule myself"
const uniqueClassValidator = typir.factory.Classes.createUniqueClassValidation({ registration: 'MYSELF' });
// unique methods per class (optional), needs the class validator
typir.factory.Classes.createUniqueMethodValidation({
    isMethodDeclaration: (node) => isMethodDecl(node),
    getClassOfMethod: (method, _type) => method.$container,
    uniqueClassValidator,
    registration: { languageKey: MethodDecl.$type },
});
// register the class validator after the method validator (the order matters today)
typir.validation.Collector.addValidationRule(uniqueClassValidator, { languageKey: ClassDecl.$type });

// no cycles in the inheritance hierarchy (class A extends B, class B extends A)
typir.factory.Classes.createNoSuperClassCyclesValidation({ registration: { languageKey: ClassDecl.$type } });
```

Without methods, `createUniqueClassValidation({ registration: { languageKey: ClassDecl.$type } })` is enough. Uniqueness across several documents is not reliably detected; a Langium validator using the index is the safer choice if that matters.

## Code actions for Typir problems

Set `data: diagnosticData('my-code')` (from `langium`) in the message properties, then handle `diagnostic.data.code === 'my-code'` in a `CodeActionProvider` as for any other Langium diagnostic. The LOX example (`examples/lox/src/language/lox-code-actions.ts`) and its test using `testCodeAction` from `langium/test` show the full round trip.
