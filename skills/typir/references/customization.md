# Customizing Typir services

`createTypirServices<Specifics>(...modules)` builds the services with dependency injection. Each module is a (partial) object of the same shape as `TypirServices`, whose leaves are factories `services => implementation`. Later modules override earlier ones. Services are created lazily on first access, and every implementation receives the full services object, so services can use each other.

## Replacing a service

```typescript
const typir = createTypirServices<MySpecifics>({
    Language: () => new MyLanguageService(),
    Printer: () => new MyPrinter(),
    factory: {
        Classes: services => new ClassKind(services, { typing: 'Structural', maximumNumberOfSuperClasses: 2 }), // must be >= 0, despite the doc comment
        Functions: services => new FunctionKind(services, { typeToInferForCallsOfFunctionsWithoutOutput: () => typeVoid }),
    },
});
```

Extend the `Default*` implementations (for example `DefaultLanguageService`, `DefaultTypeConflictPrinter`, `DefaultTypeInferenceCollector`) and override only what you need.

## The Language service

This is the service most projects should customize, because the default knows nothing about your AST:

```typescript
import { DefaultLanguageService } from 'typir';

export class MyLanguageService extends DefaultLanguageService<MySpecifics> {
    override getLanguageNodeKey(node: AstNode): string | undefined {
        return node.$type; // or node.constructor.name for class based ASTs
    }
    override getAllSuperKeys(key: string): string[] {
        return superTypesOf[key] ?? []; // e.g. 'BinaryExpression' -> ['Expression']
    }
    override getAllSubKeys(key: string): string[] {
        return subTypesOf[key] ?? [];
    }
    override isLanguageNode(node: unknown): node is AstNode {
        return typeof node === 'object' && node !== null && '$type' in node;
    }
}
```

* With `getLanguageNodeKey` implemented, rules registered with `languageKey` run only for matching nodes, and rules without a key run for all nodes.
* `getAllSuperKeys` lets a rule registered for `'Expression'` apply to all expression subtypes.
* A strict `isLanguageNode` turns accidental return values from inference rules into clear errors instead of strange delegations.

## Adding services

Use `createTypirServicesWithAdditionalServices` to add your own services, for example a custom kind exposed as a factory:

```typescript
type MyAdditionalServices = {
    readonly factory: {
        readonly Matrix: CustomKind<MatrixProps, MySpecifics>;
    };
};
export type MyTypirServices = TypirServices<MySpecifics> & MyAdditionalServices;

const typir: MyTypirServices = createTypirServicesWithAdditionalServices<MySpecifics, MyAdditionalServices>(
    { factory: { Matrix: services => new CustomKind<MatrixProps, MySpecifics>(services, { name: 'Matrix' }) } }, // new services
    { Language: () => new MyLanguageService() },                                                               // optional overrides
);
typir.factory.Matrix.create({ ... });
```

The first argument must provide all added services; up to four further modules may override existing ones.

## Several instances of the same kind

Every kind needs a unique `$name`, and every type a unique identifier. When you register a second instance of a predefined kind (for example structs next to classes), give it its own `$name` and `identifierPrefix`:

```typescript
Structs: services => new ClassKind(services, { $name: 'StructKind', identifierPrefix: 'struct', typing: 'Structural' }),
```

Otherwise you get "duplicate kind named 'ClassKind'" or "The identifier 'class-A' ... collides with ...". Custom kinds derive their `$name` from `name` (`CustomKind-<name>`), so their names must be unique.

## One Typir instance per language

Create the services once (per language, per test file, or per document set), create all predefined types right after, and keep references to the types you need later. Primitives cannot be created twice in the same instance, so do not call your setup function repeatedly on the same services.
