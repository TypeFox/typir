---
name: typir-langium
description: >
  Add, extend, debug, and test type checking for Langium based DSLs with Typir and its Langium
  binding (npm package "typir-langium"). Use this skill whenever a project imports from
  "typir-langium", or the user wants type checking, type inference, or type errors in a Langium
  language: implementing LangiumTypeSystemDefinition (onInitialize, onNewAstNode), wiring
  createTypirLangiumServices and initializeLangiumTypirServices into the Langium module, creating
  function or class types from user declarations, using language keys ($type) for rules, using
  Typir inside a ScopeProvider or Linker (for example member access on classes), figuring out why
  type errors are missing or wrong in the editor or in tests, or writing vitest tests that assert
  Typir diagnostics on Langium documents. Use it even when the user only says "add a type system
  to my Langium grammar" and Typir is not installed yet. For Typir without Langium, use the typir
  skill instead.
---

# Typir-Langium

Typir-Langium connects Typir to Langium. Typir itself stays the same: kinds, factories, inference rules, validation rules, conversions, and subtyping all work as in core Typir. The binding adds three things on top:

1. **Lifecycle.** Types derived from user code (functions, classes) are created per document while Langium builds it, and removed again when the document changes or is deleted.
2. **Language keys.** Rules can be registered for an AST `$type`, and Langium's `AstReflection` makes a rule for a supertype (for example `Expr`) apply to all subtypes.
3. **Validation integration.** Typir validation problems show up as Langium diagnostics, next to the language's own checks.

This skill covers only the Langium specific parts. For kinds, inference rules, validations, relationships, and the core gotchas (missing `.finish()`, `validateArgumentsOfCalls`, and so on), also use the **typir** skill. If it is not available, the Typir repository (`github.com/TypeFox/typir`) has the `examples/ox` (functions, operators) and `examples/lox` (classes, methods, overloading, scoping) Langium examples, which are the best reference implementations.

## Mental model

```
Langium document build:  Parsed -> IndexedContent -> ComputedScopes -> Linked -> IndexedReferences -> Validated
                                                          |                                               |
                     onNewAstNode(node) for every node ---+                Typir validation as one check ---+
                     (old types of this document removed first)            on every AstNode, plus before/after
                                                                           document hooks

onInitialize(typir)  runs once, when initializeLangiumTypirServices is called (or lazily on the first build)
```

* **`onInitialize`** defines everything that does not depend on user code: primitives, operators, global inference rules, validation rules, conversions, built-in validations. It receives no AST.
* **`onNewAstNode`** is called for every node of a document (including the root) after scope computation and **before linking**. Create types for declarations here. Every type added to the type graph during that call is associated with the document and removed automatically when the document is rebuilt or deleted.
* **Rules created through a type's builder** (`.inferenceRuleForCalls(...)`, `.inferenceRuleForFieldAccess(...)` and so on) are bound to that type and removed with it. Rules added via `typir.Inference.addInferenceRule*` or `typir.validation.Collector.addValidationRule*` are global and never removed, so add those only in `onInitialize`.
* **Inference results are cached** per document and the cache is cleared after linking, so types inferred during scoping or linking are computed again for validation.

## Setting up Typir in a Langium project

Work through these steps in order. `references/setup.md` has the full module code and the customization options.

1. **Install** `typir-langium` (it depends on `typir`, which you also import from directly). Use `typir/test` and `langium/test` for tests.

2. **Declare the specifics** with the generated `XxxAstType`. Use `interface ... extends`, not a type intersection.

   ```typescript
   import { TypirLangiumSpecifics } from 'typir-langium';
   import { MiniAstType } from './generated/ast.js';

   export interface MiniSpecifics extends TypirLangiumSpecifics {
       AstTypes: MiniAstType;
   }
   ```

3. **Implement `LangiumTypeSystemDefinition<MiniSpecifics>`** with `onInitialize` and `onNewAstNode`. Inside `onInitialize`, define types in dependency order: primitives with their literal and type reference rules first, then operators, then the remaining inference rules, then validation rules.

4. **Register the Typir services in the language module** and pass the generated `reflection` **instance** (not the `XxxAstReflection` class):

   ```typescript
   import { createTypirLangiumServices, initializeLangiumTypirServices, TypirLangiumServices } from 'typir-langium';
   import { reflection } from './generated/ast.js';

   export type MiniAddedServices = {
       typir: TypirLangiumServices<MiniSpecifics>,
   };
   // in the module:
   typir: () => createTypirLangiumServices(shared, reflection, new MiniTypeSystem()),
   ```

5. **Call `initializeLangiumTypirServices(Mini, Mini.typir)`** in `createMiniServices`, after `shared.ServiceRegistry.register(Mini)` and after registering your own validation checks. This registers Typir's validations with Langium's `ValidationRegistry` and runs `onInitialize`. Without it, no type errors are reported at all, and nothing fails loudly.

6. **Write inference rules with language keys.** Prefer `languageKey: BinaryExpr.$type` over `filter: isBinaryExpr`, and use `typir.Inference.addInferenceRulesForAstNodes({ VarDecl: ..., Ref: ... })` for delegations. See `references/rules-and-validation.md`.

7. **Create user-defined types in `onNewAstNode`**: functions, classes, fields, and the rules for calls, constructors, type references, and member access. See `references/user-defined-types.md`.

8. **Move type related checks out of the Langium validator** into Typir validation rules (`addValidationRulesForAstNodes`), and keep the Langium validator for everything else (names, structure).

9. **Write tests** that parse and validate whole documents (see Testing below).

## Things that go wrong most often

Check these first when something "just doesn't work". The core Typir gotchas (in the typir skill) apply as well.

| Symptom | Likely cause |
|---|---|
| No type errors at all, no exceptions | `initializeLangiumTypirServices` is not called, or it is called on different service instances than the ones used for parsing. |
| Errors appear only for some node types | A rule's `languageKey` is a string with a typo, or a rule for a supertype is shadowed by an earlier, more specific rule. Use `X.$type` constants to avoid typos. |
| A call or `new C()` infers the wrong function or class | The `matching` callback of a rule created in `onNewAstNode` does not compare with the *current* declaration (`n.target.ref === node`), so the first created type claims every call. |
| Variables typed with a class (`let d: Dog`) have no type | Classes need a second `.inferenceRuleForClassLiterals(...)` for the type reference node, in addition to the one for `new` expressions. |
| Member access `a.b` never links, or always links to the wrong field | Langium's default scoping knows nothing about types. Write a `ScopeProvider` that infers the receiver with `typir.Inference.inferType` and scopes the fields of `classType.associatedLanguageNode`. |
| Duplicate types, "already exists" errors, or memory growth after edits | Types or global rules were created in `onInitialize` from user code, or global rules (`addInferenceRule*`, `addValidationRule*`) are added in `onNewAstNode`. Only type builders clean up after themselves. |
| Later tests see functions or classes from earlier tests | Documents from previous tests still exist. Call `deleteAllDocuments(services.shared)` in `afterEach`. |
| `expect(messages).toEqual([...])` fails although the error is "right" | Typir diagnostics read `While validating the AstNode '<text>', this error is found: <message>` plus nested details. Match substrings. |
| Unique class check reports nothing | `createUniqueClassValidation({ registration: 'MYSELF' })` returns a rule that you must register yourself, after `createUniqueMethodValidation` if you use it. |
| Constraint like `ensureNodeIsAssignable` reports nothing for a wrong value | One side cannot be inferred, and constraints stay silent in that case. Infer both nodes directly to find the missing rule. |
| Reference `.ref` is `undefined` inside a rule | Unresolved cross-reference (a linking error is reported anyway). Return `InferenceRuleNotApplicable` instead of throwing. |

## Debugging a type problem

1. **Check that the integration runs.** `typir.infrastructure.Graph.getAllRegisteredTypes()` after parsing a document should list your primitives and the user-defined types of that document. Empty means `initializeLangiumTypirServices` or `onNewAstNode` did not run; primitives without user types means `onNewAstNode` does not recognize the declarations.
2. **Infer the node directly.** Get the node from the parsed document (`document.parseResult.value`), call `typir.Inference.inferType(node)`, and print problems with `typir.Printer.printTypirProblems(result)` when `!isType(result)`.
3. **Look at the full diagnostics**, including Langium linking errors. A linking error usually explains a missing type.
4. **Check the order of rules.** For a node, rules registered for its exact `$type` run first, then rules for its supertypes, then filter-only rules; the first one returning a type wins.

`references/testing-and-debugging.md` has more detail.

## Testing

Test through Langium, the way users see the errors: parse a document with validation and look at its diagnostics.

```typescript
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { deleteAllDocuments } from 'typir-langium';
import { compareValidationIssuesStrict, expectTypirTypes } from 'typir/test';
import { isFunctionType } from 'typir';

const services = createMiniServices(EmptyFileSystem);
const parse = parseHelper<Program>(services.Mini);

afterEach(async () => {
    await deleteAllDocuments(services.shared);
    expectTypirTypes(services.Mini.typir, isFunctionType, ...builtInFunctionAndOperatorNames); // no user-defined types left
});

test('condition must be boolean', async () => {
    const document = await parse('if (1) { }', { validation: true });
    const messages = (document.diagnostics ?? []).map(d => typeof d.message === 'string' ? d.message : d.message.value);
    compareValidationIssuesStrict(messages, ['Conditions need to be evaluated to boolean']); // substring matching
});
```

Also test the lifecycle: change a declaration in one document and check that a dependent document gets new errors, and that types disappear after deleting documents. `references/testing-and-debugging.md` shows multi-document tests and checks for inferred types.

## Reference files

Read the one that matches the task; there is no need to read them all.

* `references/setup.md`: complete module wiring, `createTypirLangiumServices` parameters, customization modules and replacing services, additional services, the specifics, and the replaced core services.
* `references/rules-and-validation.md`: language keys and supertype keys, batch registration, operators in a Langium grammar, validation integration and message properties (`languageProperty`, `data` for code actions), built-in unique and cycle validations.
* `references/user-defined-types.md`: `onNewAstNode` patterns for functions and classes (fields, inheritance, constructors, type references, field access, `null`), incremental updates and documents depending on each other, and using Typir in a `ScopeProvider` or `Linker`.
* `references/testing-and-debugging.md`: test helpers, assertion styles, multi-document and lifecycle tests, checking inferred types, and a debugging checklist.
