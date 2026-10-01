# User-defined types

## Contents

* When `onNewAstNode` runs, and what that means
* Functions
* Classes: fields, inheritance, constructors, type references, field access
* `null` and other conversions to class types
* Incremental updates and several documents
* Using Typir in a ScopeProvider or Linker

## When `onNewAstNode` runs, and what that means

`onNewAstNode(node, typir)` is called for every node of a document, after Langium's `ComputedScopes` phase and before `Linking`. Consequences:

* **Check the node type and create types only for declarations.** Most calls do nothing.
* **References are not linked yet.** Accessing `.ref` triggers linking of that reference on demand. That is fine for simple references (`superClass?.ref`), but if a custom `ScopeProvider` or `Linker` uses Typir inference, it re-enters Typir while types are still being created. Prefer passing AST nodes (for example `type: field.type`, a `TypeRef` node) and let Typir infer them later, instead of resolving types yourself.
* **Pass AST nodes as types.** Typir accepts a type, a type name, or an AST node wherever a type is expected; an AST node is resolved through inference, delayed until the needed types exist. That is how declarations can reference classes declared later or in other documents.
* **Every type added to the graph during the call is owned by the current document** and removed when it is rebuilt or deleted. Inference rules created via the builder of that type are removed together with it.
* **Do not register global rules here** (`addInferenceRule*`, `addValidationRule*`); they are never removed. Put the logic in the builder rules or in a global rule in `onInitialize` that works for all declarations.

## Functions

```typescript
onNewAstNode(node: AstNode, typir: TypirLangiumServices<MiniSpecifics>): void {
    if (isFunDecl(node)) {
        typir.factory.Functions.create({
            functionName: node.name,
            outputParameter: { name: NO_PARAMETER_NAME, type: node.returnType ?? typeVoidOf(typir) },
            inputParameters: node.params.map(p => ({ name: p.name, type: p.type })),
            associatedLanguageNode: node,
        })
        // the declaration itself has the function type
        .inferenceRuleForDeclaration({ languageKey: FunDecl.$type, matching: (decl: FunDecl) => decl === node })
        // calls of exactly this declaration
        .inferenceRuleForCalls({
            languageKey: Ref.$type,
            matching: (call: Ref) => call.call && call.target.ref === node,
            inputArguments: (call: Ref) => call.args,
            validateArgumentsOfFunctionCalls: true, // report wrong argument types and counts
        })
        .finish();
    }
}
```

Points to watch:

* **`matching` must compare with the current declaration** (`call.target.ref === node`). Matching by name only works without overloading; matching without any condition makes the first function claim every call.
* **Distinguish calls from plain references** (`call.call`, `explicitOperationCall` in LOX), otherwise a reference to a function variable is treated as a call.
* **Optional return types**: when the grammar allows omitting the return type, use an explicit `void` primitive (look it up with `typir.factory.Primitives.get({ primitiveName: 'void' })`). Functions without an output fail on call inference.
* **Return statements**: validate them in `onInitialize` with a rule for `ReturnStmt` that finds the enclosing function via `AstUtils.getContainerOfType(node, isFunDecl)` and checks `ensureNodeIsAssignable(node.value, fn.returnType, ...)`.
* **Overloading with linking**: when several functions share a name, Langium links a call to the first one by name. To link to the right overload, override the `Linker` (see below).

## Classes

```typescript
if (isClassDecl(node)) {
    const className = node.name;
    const classType = typir.factory.Classes.create({
        className,
        superClasses: node.superClass?.ref,                          // AST node, inferred later
        fields: node.fields.map(f => ({ name: f.name, type: f.type })), // TypeRef nodes, inferred later
        methods: [],                                                 // or function details, see LOX
        associatedLanguageNode: node,                                // needed for scoping, see below
    })
    // the declaration has the class type
    .inferenceRuleForClassDeclaration({ languageKey: ClassDecl.$type, matching: (decl: ClassDecl) => decl === node })
    // constructor calls: new Dog()
    .inferenceRuleForClassLiterals({
        languageKey: NewExpr.$type,
        matching: (expr: NewExpr) => expr.classRef.ref === node,
        inputValuesForFields: () => new Map(), // nominal typing: field values do not matter
    })
    // type references: let d: Dog
    .inferenceRuleForClassLiterals({
        languageKey: TypeRef.$type,
        matching: (ref: TypeRef) => ref.classRef?.ref === node,
        inputValuesForFields: () => new Map(),
    })
    // field access: d.name, for fields declared in this class
    .inferenceRuleForFieldAccess({
        languageKey: MemberAccess.$type,
        matching: (access: MemberAccess) => access.member.ref?.$container === node,
        field: (access: MemberAccess) => access.member.ref!.name,
    })
    .finish();
}
```

* The **second `inferenceRuleForClassLiterals` for type references** is easy to forget; without it, every variable or parameter declared with a class type has no type, and assignments to it are silently not checked.
* **Inheritance**: subtyping between a class and its superclasses comes for free (nominal typing is the default). Fields inherited from a superclass are found through the field access rule of the class that declares them, which is why `matching` compares the field's `$container` and not the receiver.
* **Equal names**: two class declarations with the same name result in one class type. Report duplicates with the unique class validation (`rules-and-validation.md`).
* `finish()` returns a `TypeInitializer`; use `.addListener(type => ...)` or `.getTypeFinal()` to get the class type.

## `null` and other conversions to class types

A `null` literal is a primitive in `onInitialize`. Make it assignable to each class as soon as the class type exists:

```typescript
classType.addListener(type => {
    typir.Conversion.markAsConvertible(typir.factory.Primitives.get({ primitiveName: 'null' })!, type, 'IMPLICIT_EXPLICIT');
});
```

The conversion edge belongs to the class type and disappears with it. A conversion to a single "top class" type does not work, since variables have concrete class types.

## Incremental updates and several documents

* When a document changes, Langium creates a new AST. Typir-Langium first removes all types of the old version, then calls `onNewAstNode` for the new nodes. Documents that reference the changed declarations are rebuilt by Langium too, so their diagnostics are updated.
* Documents can reference each other: a class declared in `a.mini` used in `b.mini` works through Langium's global scope, and Typir resolves the reference by inference.
* A type whose creation waits for a type from another document is owned by the document that was being processed when it was finally created. In rare cases a type then survives the deletion of its declaring document. Test the delete case if your users rely on it.

## Using Typir in a ScopeProvider or Linker

Member access (`a.b.c`) needs the type of the receiver to know which fields are visible. Infer it with Typir and use the class declaration associated with the class type:

```typescript
export class MiniScopeProvider extends DefaultScopeProvider {
    protected readonly typir: TypirLangiumServices<MiniSpecifics>;

    constructor(services: MiniServices) {
        super(services);
        this.typir = services.typir;
    }

    override getScope(context: ReferenceInfo): Scope {
        if (isMemberAccess(context.container) && context.property === 'member') {
            const receiverType = this.typir.Inference.inferType(context.container.receiver);
            if (isClassType(receiverType)) {
                const classDecl = receiverType.associatedLanguageNode as ClassDecl;
                return this.createScopeForNodes(collectFieldsIncludingSuperClasses(classDecl));
            }
            return EMPTY_SCOPE; // unknown receiver type: the reference stays unresolved
        }
        return super.getScope(context);
    }
}
```

Register it in the module (`references: { ScopeProvider: (services) => new MiniScopeProvider(services) }`). This works because types are created at `ComputedScopes`, before linking. Walking the superclass chain (`collectFieldsIncludingSuperClasses`) uses `superClass?.ref`, guarded against cycles.

A custom `Linker` can resolve overloaded calls the same way: infer the argument types, and choose the candidate whose parameter types are assignable (`typir.Assignability.isAssignable`). Do not infer the type of the call node itself during linking; its own references are not resolved yet. See `examples/lox/src/language/lox-linker.ts` and `lox-scope.ts` in the Typir repository.
