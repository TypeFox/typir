---
name: typir
description: >
  Build, extend, debug, and test type systems with Typir, the TypeScript library (npm package
  "typir") for type inference and type checking of DSLs and other software languages. Use this
  skill whenever code imports from "typir" or "typir/test", or the user wants to add type checking
  to a language with a hand-written or non-Langium AST: defining primitive, function, operator,
  class, or custom types; writing inference rules or validations; configuring conversions,
  subtyping, or assignability; customizing TypirServices; figuring out why a node infers the wrong
  type or why a validation does not fire; or writing vitest tests for a type system. Use it even
  when the user only says "type checker for my language" and Typir is already a dependency. If the
  project is Langium-based (imports "typir-langium" or "langium"), use the typir-langium skill instead.
---

# Typir

Typir is a TypeScript library that gives a language implementation a type system: you describe the types of your language and how AST nodes map to them, and Typir answers questions like "what is the type of this node?", "is `A` assignable to `B`?", and "which type errors does this node have?".

Typir is AST agnostic. It never parses or walks your AST on its own; it only looks at the nodes you hand it. Keep that in mind, because it explains most surprises (validation not reaching child nodes, inference rules never firing, and so on).

What Typir does **not** do: parse, resolve names, unify type variables, or solve constraints. Generics, union types, and lambdas are not built in. If a task needs these, say so early and design around it (for example with a `CustomKind`).

## Mental model

```
TypirServices (one instance per language)
├── factory.*            create types: Primitives, Functions, Operators, Classes, Top, Bottom
├── Inference            AST node -> Type, via an ordered list of inference rules
├── validation.Collector AST node -> ValidationProblem[], via validation rules
├── validation.Constraints helpers for common checks (assignable, equal, not-type)
├── Assignability / Equality / Subtype / Conversion   relationships between types
├── Printer              turns problems into readable, nested explanations
├── Language             tells Typir about your AST (node keys, what counts as a node)
└── infrastructure.Graph the type graph: types are nodes, relationships are edges
```

* A **kind** is a category of types (primitive, function, class, custom ...). A **type** is one node in the type graph, identified by a unique identifier and displayed by its name.
* **Inference rules** are tried in order and the first one that returns a type wins. A rule can also return another AST node, which means "my type is the type of that node" (delegation).
* **Validation rules** report problems through an `accept` callback. Some kinds add their own validations (for example argument checks on calls) when you opt in.
* **Assignability** holds when two types are equal, or when there is a path of implicit conversions and subtype edges from source to target.

## Bootstrapping a type system

Work through these steps in order. Each step builds on types created in the previous ones. `references/types.md` has the details for every kind.

1. **Declare the specifics and create the services.** Give Typir the root type of your AST so every API is typed against it. Leaving `LanguageType` as `unknown` loses most compile time checking.

   ```typescript
   import { createTypirServices, TypirSpecifics } from 'typir';

   export interface MySpecifics extends TypirSpecifics {
       LanguageType: AstNode; // root type of all your AST nodes
   }
   export const typir = createTypirServices<MySpecifics>();
   ```

2. **Decide whether you need a custom `Language` service.** The default one returns no language keys, so any rule registered with `languageKey` will silently never run. If you want key based dispatch (faster, and necessary as the language grows), override `getLanguageNodeKey`. Also consider overriding `isLanguageNode`, since the default treats almost any value as an AST node. See `references/customization.md`.

3. **Create the primitive types** together with the rules that infer them for literals.

   ```typescript
   const typeNumber = typir.factory.Primitives.create({ primitiveName: 'number' })
       .inferenceRule({ filter: isNumberLiteral })
       .finish(); // primitives: finish() returns the type itself
   ```

4. **Create operators.** Write one inference rule per syntactic shape (binary, unary) and reuse it for every operator, so that overload resolution can compare all signatures with the same name.

   ```typescript
   const binaryRule: InferOperatorWithMultipleOperands<MySpecifics, BinaryExpression> = {
       filter: isBinaryExpression,
       matching: (node, operatorName) => node.operator === operatorName,
       operands: node => [node.left, node.right],
       validateArgumentsOfCalls: true, // off by default; turn it on to get type errors for operands
   };
   typir.factory.Operators.createBinary({ name: '+', signatures: [
       { left: typeNumber, right: typeNumber, return: typeNumber },
       { left: typeString, right: typeString, return: typeString },
   ] }).inferenceRule(binaryRule).finish();
   ```

5. **Create functions and classes** with their call, declaration, literal, and field access rules. Their `finish()` returns a `TypeInitializer`; call `.getTypeFinal()` on it when you need the type itself.

6. **Declare relationships.** `typir.Conversion.markAsConvertible(from, to, 'IMPLICIT_EXPLICIT' | 'EXPLICIT')` and `typir.Subtype.markAsSubType(sub, super)`. Classes and custom kinds create their own subtype edges.

7. **Add inference rules for everything else**, mostly delegations: a variable has the type of its declaration, a declaration has the type of its initializer or its declared type, a parenthesized expression has the type of its content. See `references/inference.md`.

   ```typescript
   typir.Inference.addInferenceRule(node => {
       if (isVariableReference(node)) {
           return node.declaration; // delegate to another node
       }
       return InferenceRuleNotApplicable;
   });
   ```

8. **Add validation rules** for statements that impose type constraints: assignments, conditions, return statements, and so on. See `references/validation.md`.

   ```typescript
   typir.validation.Collector.addValidationRule((node, accept) => {
       if (isAssignment(node)) {
           typir.validation.Constraints.ensureNodeIsAssignable(node.value, node.target, accept,
               (actual, expected) => ({ message: `'${actual.name}' is not assignable to '${expected.name}'.` }));
       }
   });
   ```

9. **Drive validation over your AST.** `validate(node)` checks only the node you pass. Write a traversal that calls it on every node (or every node that can have type problems) and collect the results. If you use lifecycle validation rules, call `validateBefore(root)` first and `validateAfter(root)` last.

10. **Write tests** for inference and validation (see below).

A complete, small, working example lives in the Typir repository under `examples/expression` (`expression-type-system.ts`, `expression-validator.ts`, and its tests). Point users at it when they want to see the whole picture.

## Things that go wrong most often

These are the gotchas that cost the most time. Check them before anything else when something "just doesn't work".

| Symptom | Likely cause |
|---|---|
| A type does not exist, no error was thrown | `.finish()` was not called. Nothing is created until it is. |
| `getTypeFinal is not a function` | You called it on a primitive, top, or bottom type; their `finish()` already returns the type. |
| `getTypeFinal()` returns `undefined`, or a type stuck in `'Identifiable'` | The type depends on a type that does not exist yet (common with classes that reference each other or custom types built from other custom types). Create the missing type, or use `.addListener(...)` on the initializer. |
| Inference rule never fires | Registered with `languageKey` while the `Language` service returns no keys; or an earlier rule already returned a type for that node. |
| No error for wrong operand or argument types | `validateArgumentsOfCalls` (operators) or `validateArgumentsOfFunctionCalls` (functions) is not set to `true`. |
| Errors on children are missing | `validate()` is not recursive; your traversal skipped those nodes. |
| `inferType` result used as a `Type` crashes | It returns `Type \| InferenceProblem[]`. Check with `isType(result)` first. |
| "There is already a primitive type with name ..." | Primitives cannot be created twice. Create them once and keep the reference (custom, class, and function types are deduplicated instead). |
| "duplicate kind named ..." or "identifier ... collides" | Two kind instances share a `$name` or an `identifierPrefix`. Give the second one its own. |
| "There is a recursion loop for inferring the type from ..." | Inference rules delegate in a cycle: inferring node A needs the type of node B, which needs the type of A again. Break the cycle, for example by using a declared type instead of the initializer. |
| One mistake yields two errors, for example in `print(1 + true)` | Expected: the inner `+` fails, so the argument of `print` has no type and the call reports too. Assert both in tests, or skip the outer check in your own rules when inference of a child failed. |
| `-"a"` infers `number`; a new rule for `vec + vec` never runs | Operators with one signature (or overloads with one shared return type) infer their return type without looking at the operands. Their rule claims every node its `matching` accepts, so exclude nodes meant for other rules in `matching`. |
| Built-in unique or cycle validations report nothing | They are lifecycle rules: `validateBefore(root)` and `validateAfter(root)` must run around the per-node `validate` calls. |
| Error on calls to void functions | Functions without `outputParameter` throw during call inference unless `typeToInferForCallsOfFunctionsWithoutOutput` is configured on the function kind. Prefer an explicit `void` primitive as the output. |

## Debugging a type problem

Approach debugging from the outside in:

1. **Infer the node directly.** `const result = typir.Inference.inferType(node)`. If `isType(result)`, print `result.getName()`. Otherwise print the problems with `typir.Printer.printTypirProblems(result)`. The output is a tree explaining which rules were tried and why each one failed.
2. **Check the relationship directly.** `typir.Assignability.getAssignabilityResult(source, target)` (or `getAssignabilityProblem`) explains *why* assignability fails. `typir.Conversion.getConversion(from, to)` and `typir.Subtype.isSubType(sub, super)` let you check the individual ingredients.
3. **Look at the type graph.** `typir.infrastructure.Graph.getAllRegisteredTypes()` lists every type that exists. A missing type usually means a missing `.finish()` or an unresolved dependency (`type.getInitializationState()` is not `'Completed'`).
4. **Print validation problems in full.** `typir.Printer.printTypirProblem(problem)` includes the nested sub-problems, which `problem.message` alone does not.

`references/testing-and-debugging.md` has more detail and the exact texts of common messages.

## Testing

Typir ships vitest helpers under the `typir/test` entry point (they require vitest as a dev dependency):

```typescript
import { expectToBeType, expectTypirTypes, expectValidationIssuesStrict, expectValidationIssuesNone } from 'typir/test';
import { isPrimitiveType } from 'typir';

expectToBeType(typir.Inference.inferType(node), isPrimitiveType, t => t.getName() === 'number');
expectValidationIssuesStrict(typir, assignment, ["'string' is not assignable to 'number'."]);
expectValidationIssuesNone(typir, otherAssignment);
```

The `expectValidationIssues*` helpers validate only the single node you pass and match expected texts as **substrings** of the printed problems. When testing a whole program, run your own traversal and compare the collected messages with `compareValidationIssues*`. See `references/testing-and-debugging.md`.

## Reference files

Read the one that matches the task at hand; there is no need to read them all.

* `references/types.md`: every kind (primitives, top and bottom, functions, operators, classes, custom kinds, experimental parametric and multiplicity kinds), type descriptors and references, the initialization lifecycle, and cyclic definitions.
* `references/inference.md`: inference rule shapes, delegation, the rules attached to types, two-phase rules for children, overload resolution, and language keys.
* `references/validation.md`: validation rules, `accept`, constraint helpers, lifecycle rules, built-in validations (unique functions, unique classes, superclass cycles), and traversing an AST.
* `references/relationships.md`: conversion, subtyping, equality, and assignability, including how they interact.
* `references/customization.md`: replacing services, the `Language` service, adding services and additional kinds, and kind options.
* `references/testing-and-debugging.md`: `typir/test` helpers, test structure, reading the printer output, and common error messages.
