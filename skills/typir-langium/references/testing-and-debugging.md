# Testing and debugging

## Contents

* Test setup
* Asserting diagnostics
* Asserting inferred types
* Multi-document and lifecycle tests
* Debugging checklist

## Test setup

Create the services once per test file, with `EmptyFileSystem`. Clean up documents after each test, otherwise user-defined types from earlier tests stay in the type graph and change later results (for example duplicate function errors).

```typescript
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { isClassType, isFunctionType } from 'typir';
import { deleteAllDocuments } from 'typir-langium';
import { compareValidationIssuesStrict, compareValidationIssuesNone, expectTypirTypes } from 'typir/test';
import { afterEach, expect, test } from 'vitest';

const services = createMiniServices(EmptyFileSystem);
const parse = parseHelper<Program>(services.Mini);

afterEach(async () => {
    await deleteAllDocuments(services.shared);
    // only built-in functions and operators remain, no user-defined classes
    expectTypirTypes(services.Mini.typir, isFunctionType, ...operatorSignatureNames);
    expectTypirTypes(services.Mini.typir, isClassType);
});

async function messagesOf(text: string): Promise<string[]> {
    const document = await parse(text, { validation: true });
    return (document.diagnostics ?? []).map(d => typeof d.message === 'string' ? d.message : d.message.value);
}
```

`expectTypirTypes(typir, isXxxType, ...names)` checks that exactly these types of that kind exist. Operators are function types and appear once per signature, so `+` with signatures for `int` and `string` is listed twice, and a unary and a binary `-` are both listed.

## Asserting diagnostics

Typir diagnostics wrap your message: `While validating the AstNode '<text>', this error is found: <your message>`, followed by nested details. So:

```typescript
compareValidationIssuesStrict(await messagesOf('let x: int = "a";'), ["is not assignable to 'x' with type 'int'"]); // each expected text is a substring of exactly one message, no extra messages
compareValidationIssuesNone(await messagesOf('let x: int = 1;'));
expect((await messagesOf('if (1) { }')).some(m => m.includes("Conditions need to be evaluated to 'bool'"))).toBe(true);
```

* Assert on texts, not only counts, so that a test does not pass because of an unrelated error (like a linking error).
* Check that valid programs produce **no** diagnostics; this catches false positives and missing rules (missing rules often make constraints silent).
* One mistake can produce several diagnostics, for example `f(1 + true)` reports the `+` and the argument of `f`. Expect both or check with `some`.
* For warnings and errors separately, filter by `d.severity` (`DiagnosticSeverity.Error` / `.Warning` from `vscode-languageserver-types`, or the numbers 1 and 2).
* `expectValidationIssues*` from `typir/test` validate a single node with Typir directly, bypassing Langium. Use them for unit tests of one rule; use document diagnostics for everything else.

## Asserting inferred types

```typescript
import { AstUtils } from 'langium';
import { isType } from 'typir';
import { expectToBeType } from 'typir/test';

const document = await parse('class A {} let a: A = new A();');
const decl = AstUtils.streamAst(document.parseResult.value).filter(isVarDecl).head()!;
const result = services.Mini.typir.Inference.inferType(decl);
expectToBeType(result, isClassType, t => t.getName() === 'A');
```

Check linking too where it matters, for example that `a.b` resolves (`access.member.ref` is defined and has the expected `$container`).

## Multi-document and lifecycle tests

With `EmptyFileSystem`, `DocumentBuilder.update([uri], [])` re-reads the document from the file system and fails with "No file system is available". Put the new text into the in-memory `TextDocuments` first; Langium then re-parses the changed document and relinks the documents depending on it.

```typescript
import { URI } from 'langium';
import { TextDocument } from 'vscode-languageserver-textdocument';

test('class from another document, updated and deleted', async () => {
    const libUri = 'file:///lib.mini';
    await parse('class Animal { name: string; }', { documentUri: libUri });
    const main = await parse('let a: Animal = new Animal(); let n: string = a.name;', { documentUri: 'file:///main.mini', validation: true });
    expect(main.diagnostics).toHaveLength(0);

    // change the library: its old types are removed, new ones created, main.mini is relinked
    const workspace = services.shared.workspace;
    workspace.TextDocuments!.set(TextDocument.create(libUri, 'mini', 2, 'class Animal { name: int; }'));
    await workspace.DocumentBuilder.update([URI.parse(libUri)], []);
    await workspace.DocumentBuilder.build([main], { validation: true });
    expect(main.diagnostics).toHaveLength(1); // 'int' is not assignable to 'n' of type 'string'
    expectTypirTypes(services.Mini.typir, isClassType, 'Animal');

    // delete the library: its class type disappears
    workspace.TextDocuments!.delete(libUri);
    await workspace.DocumentBuilder.update([], [URI.parse(libUri)]);
    expectTypirTypes(services.Mini.typir, isClassType);
});
```

Points to test for each user-defined kind of type: the type exists after parsing, it is gone after `deleteAllDocuments`, a change in its declaration changes the diagnostics of documents using it, and two declarations with the same name are reported.

## Debugging checklist

Work from the outside in.

1. **Is Typir running at all?** After parsing, list the types: `services.Mini.typir.infrastructure.Graph.getAllRegisteredTypes().map(t => t.getName())`. No primitives: `initializeLangiumTypirServices` is missing, or the test creates services differently than production. Primitives but no user-defined types: `onNewAstNode` does not recognize the declaration nodes (check the type guards).
2. **Are there Langium errors?** Print all diagnostics, including lexer, parser, and linking errors. An unresolved reference means no type for anything built on it, and constraints then stay silent.
3. **What does Typir infer?** `const r = typir.Inference.inferType(node)`; if `!isType(r)`, print `typir.Printer.printTypirProblems(r)`. The tree shows which rules were tried and why they failed.
4. **Which rule claimed the node?** Keyed rules for the exact `$type` run before rules for supertypes, and both before filter-only rules. A rule with a too broad `matching` (for example a call rule that ignores which declaration is called) wins for every node.
5. **Why is something not assignable?** `typir.Assignability.getAssignabilityProblem(source, target)`, printed with `typir.Printer.printTypirProblem(...)`.
6. **Does a type wait for something?** `type.getInitializationState()` other than `'Completed'` means it depends on a type that does not exist yet, typically an unresolved class reference.
7. **Stale types after edits?** Compare the type graph before and after `deleteAllDocuments`. Leftovers were created outside `onNewAstNode` or by a global rule, or were completed while another document was processed.
