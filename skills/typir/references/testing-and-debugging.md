# Testing and debugging

## Test helpers from `typir/test`

These helpers use vitest, so the project needs vitest as a dev dependency.

| Helper | Checks |
|---|---|
| `expectToBeType(value, isX, details?)` | `value` is a type of the given kind (and optionally satisfies `details`); narrows `value` |
| `expectTypirTypes(typir, filter, ...names)` | exactly these types (by name) exist among the types passing `filter`, and all are `'Completed'` |
| `expectValidationIssues(typir, node, [options,] expected)` | each expected text occurs; other issues may exist too |
| `expectValidationIssuesStrict(typir, node, [options,] expected)` | exactly these issues occur, no more |
| `expectValidationIssuesAbsent(typir, node, [options,] forbidden)` | none of the forbidden texts occur |
| `expectValidationIssuesNone(typir, node, options?)` | no issues at all |
| `compareValidationIssues*(actual, expected)` | the same checks on string arrays you collected yourself |

* `options` is `{ severity?: 'error' | 'warning' | 'info' | 'hint' }`.
* Expected texts are matched as **substrings** of `typir.Printer.printTypirProblem(problem)`, so a short distinctive phrase is enough and robust against message tweaks.
* The `expectValidationIssues*` helpers validate one node only, like `Collector.validate`. To test a whole program, collect messages with your own traversal and use `compareValidationIssues*`. Note that `compareValidationIssues*` modifies the arrays passed in.
* `assertTypirType(value, isX, name?)` from `'typir'` (not `typir/test`) is a non-vitest assertion that throws.

## Structuring tests

```typescript
import { describe, expect, test } from 'vitest';
import { isPrimitiveType } from 'typir';
import { expectToBeType, compareValidationIssuesStrict } from 'typir/test';
import { initializeTypir } from '../src/type-system.js';

const { typir } = initializeTypir(); // create once; primitives cannot be re-created on the same instance

describe('inference', () => {
    test('number literal', () => {
        expectToBeType(typir.Inference.inferType(parse('1 + 2')), isPrimitiveType, t => t.getName() === 'number');
    });
});

describe('validation', () => {
    test('assigning a string to a number variable', () => {
        compareValidationIssuesStrict(validateText('var x = 1; x = "a";'), ["'string' is not assignable to 'number'"]);
    });
    test('valid program', () => {
        compareValidationIssuesStrict(validateText('var x = 1; x = 2;'), []);
    });
});
```

* Test inference and validation separately. Constraint helpers stay silent when inference fails, so a validation test passing with "no issues" can hide broken inference.
* Cover both directions: programs that must produce a given error, and programs that must not produce any.
* If tests create types dynamically (custom types, user declared classes), create a fresh Typir instance per test in `beforeEach` to keep tests independent.

## Reading Typir problems

All problems (`InferenceProblem`, `AssignabilityProblem`, `ValidationProblem`, and others) can carry `subProblems`. `typir.Printer.printTypirProblem(problem)` and `printTypirProblems(problems)` print the whole tree, one problem per line, with nested problems prefixed by `-> `, `--> `, `---> ` and so on. For example, validating `1 - "a"` prints:

```
While validating the language node '...', this error is found: The given operands for the call of the overload '-' don't match.
-> While validating the language node '...', this error is found: The given arguments don't match the parameters of '-(left: number, right: number): number'.
--> While validating the language node '...', this error is found: The parameter 'right' at index 1 got a value with a wrong type.
---> For property 'right', the types 'string' and 'number' do not match.
----> The type 'string' is not assignable to the type 'number'.
```

A node without any applicable rule prints `While inferring the type for the language node '...', at found no applicable inference rules, some problems occurred.`; the fix is a missing inference rule or delegation for that node type. The `'...'` is `printLanguageNode`, which by default calls `toString()` on the node.

Other useful printer methods: `printTypeName(type)`, `printTypeUserRepresentation(type)`, `printLanguageNode(node)`. Override `printLanguageNode` in a custom printer so that messages show readable source snippets instead of object dumps.

## Debugging checklist

1. **Does the type exist?** `typir.infrastructure.Graph.getAllRegisteredTypes().map(t => t.getName())`. Missing: was `finish()` called, and is `getInitializationState()` `'Completed'`?
2. **What does the node infer to?** `inferType(node)`; print the problems if it is not a type. Look for "no applicable inference rules" (add a rule or a delegation) versus a rule that matched but failed (the sub-problems say why).
3. **Does the right rule fire?** An earlier rule may win first. Rules with `languageKey` need a custom `Language` service. `filter` must be a real type guard for the node shape you think it is.
4. **Is the relationship there?** `getAssignabilityProblem`, `getConversion`, `isSubType` on the two types involved.
5. **Was the node validated at all?** Check that your traversal reaches it, and that `validateArgumentsOfCalls` / `validateArgumentsOfFunctionCalls` is on for call checks.

## Common error messages

| Message | Meaning |
|---|---|
| `There is already a primitive type with name '...'` | primitive created twice on the same instance |
| `duplicate kind named '...'` | two kinds share a `$name` |
| `The identifier '...' for the new type of kind '...' collides with ...` | two kinds produce the same identifier; set `identifierPrefix` |
| `There is a recursion loop for inferring the type from ...` | cyclic delegation between inference rules |
| `This inference rule has none of the properties "languageKey", "filter" and "matching" ...` | type-attached rule without any selector |
| `Only 1 super-class is allowed.` | raise `maximumNumberOfSuperClasses` in the class kind options |
| `The given operands for the call of the overload '...' don't match.` | no signature of an overloaded operator or function fits the argument types |
| `The given operands for the call of '...' don't match.` | same, for an operator or function with a single signature (note: no "overload") |

Wrong arguments cascade: when an inner call fails, the outer call that uses it as an argument reports as well, because the argument has no type. Expect both messages in strict tests.
