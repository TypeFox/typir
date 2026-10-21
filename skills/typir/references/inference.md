# Type inference

## How inference runs

`typir.Inference.inferType(node)` returns either a `Type` or an `InferenceProblem[]` (never `undefined`). Always narrow the result:

```typescript
import { isType } from 'typir';

const result = typir.Inference.inferType(node);
if (isType(result)) {
    // use result
} else {
    console.log(typir.Printer.printTypirProblems(result));
}
```

Rules are tried in registration order and the first rule that produces a type wins. If language keys are in use, rules registered for the node's key run first, then rules for its super keys, then rules without a key. Successful results are cached per node; failed attempts are not.

## Where rules come from

There are two places to register rules, and both feed the same collector:

1. **Rules attached to a type** via the builder: `.inferenceRule(...)` on primitives, top, bottom, custom types, and operators; `.inferenceRuleForCalls/ForDeclaration(...)` on functions; `.inferenceRuleForClassDeclaration/ForClassLiterals/ForFieldAccess(...)` on classes. They are removed automatically if their type is removed. Prefer these whenever a rule always produces one specific type.
2. **Free rules** via `typir.Inference.addInferenceRule(rule, options?)`. Use them for delegation and for rules that compute the type (for example get-or-create of custom types).

## Rules attached to a type (`InferCurrentTypeRule`)

```typescript
{
    filter?: (node) => node is T,          // type guard, narrows `node` for the other callbacks
    matching?: (node: T, type) => boolean, // does this node have exactly this type?
    languageKey?: string | string[],       // only with a custom Language service
    validation?: (node: T, type, accept, typir) => void, // runs for nodes this rule inferred
    skipThisRuleIfThisTypeAlreadyExists?: boolean | ((existing) => boolean),
}
```

At least one of `filter`, `matching`, `languageKey` is required. `filter` is about the shape of the node, `matching` about this particular type; for example `filter: isClassDeclaration, matching: node => node.name === 'Person'`.

`skipThisRuleIfThisTypeAlreadyExists` helps when the same type is created from several places (for example the same class declared in two documents) and only the first rule should stay.

## Free rules

A free rule is a function `(node, typir) => result`, where the result is one of:

* a `Type`
* an AST node, meaning "infer that node instead" (delegation)
* an `InferenceProblem`, to explain why inference failed
* `InferenceRuleNotApplicable` (the string `'N/A'`), meaning "not my kind of node"

```typescript
typir.Inference.addInferenceRule(node => {
    if (isVariableDeclaration(node)) {
        return node.typeAnnotation ?? node.initializer; // declared type wins over the initializer
    }
    if (isVariableReference(node)) {
        return node.declaration;
    }
    if (isParenthesized(node)) {
        return node.inner;
    }
    return InferenceRuleNotApplicable;
});
```

Return `InferenceRuleNotApplicable` for every node the rule does not handle. Returning `undefined` or anything else is interpreted by the `Language` service, and the default one considers almost any value to be an AST node.

Delegation chains are fine; cycles are not (they throw "There is a recursion loop ..."). Typical sources: `var x = x`, or a declaration that infers from its initializer while the initializer infers from the declaration.

### Type annotations

If your AST has type annotation nodes (`x: number`), give them their own inference rule that maps the annotation to a type, for example by primitive name. Then a declaration can simply delegate to its annotation:

```typescript
typir.Inference.addInferenceRule(node => {
    if (isTypeAnnotation(node)) {
        const type = typir.factory.Primitives.get({ primitiveName: node.name });
        return type ?? InferenceRuleNotApplicable;
    }
    return InferenceRuleNotApplicable;
});
```

## Rules that need the types of children

When the result depends on the types of children (and you want Typir to infer and cache them for you), use the two-phase form:

```typescript
typir.Inference.addInferenceRule({
    inferTypeWithoutChildren(node) {
        if (isArrayLiteral(node)) {
            return node.elements; // phase 1: ask Typir to infer these nodes
        }
        return InferenceRuleNotApplicable;
    },
    inferTypeWithChildrensTypes(node, childTypes) {
        // phase 2: childTypes has the same order as above; entries are undefined when inference failed
        ...
        return someType; // or an InferenceProblem
    },
});
```

For simple cases, calling `typir.Inference.inferType(child)` inside a plain rule is fine too.

## Operators and overloaded functions

Operators and functions sharing a name form an overload group. For a call, Typir infers the argument types, keeps the signatures whose parameters are assignable from those arguments, and picks the cheapest match (fewest conversion and subtype steps). If no signature fits, inference returns a problem; with `validateArgumentsOfCalls` / `validateArgumentsOfFunctionCalls` switched on, a validation error is reported as well ("The given operands for the call of the overload '-' don't match.").

**Inference does not always check arguments.** If a name has only one signature, or all its overloads return the same type, Typir returns that type right away without inferring the arguments. So `-"a"` infers `number` and `1 && 2` infers `boolean`; only the argument validation reports the mistake. Two consequences:

* An operator rule whose `matching` accepts a node *claims* it, even if the operand types are wrong. If another rule should handle some of those nodes (for example `+` on vector types added later), make the operator rule's `matching` exclude them, or register the more specific rule first.
* Error cascades depend on this: `print(1 + true)` reports twice because `+` has overloads with different return types and inference fails, while `print(1 - true)` reports only the `-` error.

For ties, Typir takes the first best match by default. To change that, override `handleMultipleBestMatches` in a subclass of the function kind's overload inference.

## Language keys

A language key is a string per node type (for example the class name or a `$type` property). Rules registered with `languageKey` only run for nodes with that key or a sub key, which matters for performance in large languages. This needs a custom `Language` service (see `customization.md`); with the default one, keyed rules never run.

```typescript
typir.Inference.addInferenceRule(node => node.initializer, { languageKey: 'VariableDeclaration' });
```

## Removing rules

`typir.Inference.removeInferenceRule(rule, options?)` removes a free rule; pass the same options used to register it. Rules registered with `{ boundToType: type }` are removed when that type is removed.
