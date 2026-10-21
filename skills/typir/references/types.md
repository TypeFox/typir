# Types and kinds

## Contents

1. Builder chains and what `finish()` returns
2. Primitives, top, and bottom
3. Functions
4. Operators
5. Classes
6. Custom kinds
7. Parametric and multiplicity kinds (experimental)
8. Type descriptors, references, and the initialization lifecycle

## 1. Builder chains and what `finish()` returns

Every factory follows `create({...})`, then optional rule methods, then `finish()`. Nothing is registered until `finish()` runs, and Typir does not warn if you forget it.

| Factory | `finish()` returns | `get(...)` returns |
|---|---|---|
| `factory.Primitives`, `factory.Top`, `factory.Bottom` | the type itself | `Type \| undefined` |
| `factory.Functions`, `factory.Classes`, custom kinds | `TypeInitializer`; call `.getTypeFinal()` | `TypeReference` |
| `factory.Operators.createUnary/Binary/Ternary` | `TypeInitializer[]` (one per signature) | none |
| `factory.Operators.createGeneric` | one `TypeInitializer` | none |

`getTypeFinal()` returns `undefined` until the type is *identifiable* (its identifier can be computed), and the type object after that. Identifiable is not the same as completed: a nominal class whose superclass does not exist yet is returned right away, but stays in state `'Identifiable'` until the superclass appears. Check `getInitializationState()` when that matters. When everything a type needs already exists, it is completed immediately.

## 2. Primitives, top, and bottom

```typescript
const typeBoolean = typir.factory.Primitives.create({ primitiveName: 'boolean' })
    .inferenceRule({ filter: isBooleanLiteral })
    .inferenceRule({ filter: isComparison }) // several rules may infer the same type
    .finish();
const typeVoid = typir.factory.Primitives.create({ primitiveName: 'void' }).finish();

const typeAny = typir.factory.Top.create({}).finish();      // supertype of everything
const typeNever = typir.factory.Bottom.create({}).finish(); // subtype of everything
```

Creating a primitive with an existing name throws, so create each one once and pass the reference around (a module level `initializeTypir()` that returns both the services and the types works well). `Primitives.get({ primitiveName: 'number' })` finds an existing one.

The inference rule passed to `.inferenceRule()` is an `InferCurrentTypeRule`. Use at least one of `filter` (type guard), `matching(node, type)`, or `languageKey`. It may also carry `validation: (node, type, accept, typir) => void`, which runs for every node that this rule inferred.

## 3. Functions

```typescript
import { NO_PARAMETER_NAME } from 'typir';

const printInit = typir.factory.Functions.create({
    functionName: 'print',
    inputParameters: [{ name: 'value', type: typeString }],
    outputParameter: { name: NO_PARAMETER_NAME, type: typeVoid },
})
    .inferenceRuleForDeclaration({         // infers the function type for its declaration
        filter: isFunctionDeclaration,
        matching: node => node.name === 'print',
    })
    .inferenceRuleForCalls({               // infers the return type for calls
        filter: isCall,
        matching: node => node.callee === 'print',
        inputArguments: node => node.arguments,
        validateArgumentsOfFunctionCalls: true, // default false
    })
    .finish();
const printType = printInit.getTypeFinal(); // FunctionType | undefined
```

* Parameter types are type descriptors (section 8), so they may be AST nodes (for example a declared type annotation) whose type is inferred.
* Creating several functions with the same `functionName` and different parameters gives you overloading. Calls are matched against all overloads; the best match by conversion cost wins.
* `outputParameter: undefined` is allowed, but inferring a call of such a function throws unless the function kind is configured with `typeToInferForCallsOfFunctionsWithoutOutput`. Most languages are better served by a `void` primitive.
* For user declared functions, create the function type from the declaration node inside your own setup code (for example when you load a document), and register `inferenceRuleForDeclaration` with a `matching` that compares to that node.
* `typir.factory.Functions.createUniqueFunctionValidation({ registration: {} })` reports duplicate signatures (see `validation.md`).

Function kind options (pass them when replacing the kind, see `customization.md`): `enforceFunctionName`, `enforceInputParameterNames`, `enforceOutputParameterName`, `subtypeParameterChecking` (default `'SUB_TYPE'`), `typeToInferForCallsOfFunctionsWithoutOutput` (default `'THROW_ERROR'`), `identifierPrefix`.

## 4. Operators

Operators are functions underneath, with a more convenient API and without declarations.

```typescript
const unaryRule: InferOperatorWithSingleOperand<MySpecifics, UnaryExpression> = {
    filter: isUnaryExpression,
    matching: (node, name) => node.operator === name,
    operand: node => node.operand,
    validateArgumentsOfCalls: true,
};
typir.factory.Operators.createUnary({ name: '-', signature: { operand: typeNumber, return: typeNumber } })
    .inferenceRule(unaryRule).finish();

// comparison operators for several operand types, all returning boolean
for (const op of ['<', '<=', '>', '>=']) {
    typir.factory.Operators.createBinary({ name: op, signatures: [
        { left: typeNumber, right: typeNumber, return: typeBoolean },
        { left: typeString, right: typeString, return: typeBoolean },
    ] }).inferenceRule(binaryRule).finish();
}

// ternary: first, second, third
typir.factory.Operators.createTernary({ name: '?:', signature: {
    first: typeBoolean, second: typeNumber, third: typeNumber, return: typeNumber,
} }).inferenceRule(ternaryRule).finish();
```

* Use `signature` for one and `signatures` for several overloads. Calling `createBinary` twice with the same name is also fine; all signatures with the same name form one overload group.
* Operator signatures take `Type` values only, not descriptors. Create the operand types first.
* Operators with an arbitrary operand list use `createGeneric({ name, outputType, inputParameter: [{ name, type }] })`.
* `validation` on an operator rule receives `(node, operatorName, operatorType, accept, typir)`.
* Operators whose operand types must be equal but are otherwise arbitrary (like `==` for any type) are not expressible as a fixed signature. Either list the signatures for all relevant types, or infer the result in a plain inference rule and check the operands in a validation rule with `ensureNodeIsEquals`.

## 5. Classes

Classes are nominal by default (`typing: 'Nominal'`); switch to `'Structural'` via the kind options.

```typescript
const personInit = typir.factory.Classes.create({
    className: 'Person',
    superClasses: baseClassNodeOrType,             // optional, at most 1 by default
    fields: [{ name: 'name', type: typeString }],  // required, may be []
    methods: [{ type: greetFunctionInit }],        // required, may be []; FunctionType descriptors
})
    .inferenceRuleForClassDeclaration({ filter: isClassDeclaration, matching: node => node.name === 'Person' })
    .inferenceRuleForClassLiterals({               // e.g. constructor calls `new Person()`
        filter: isNewExpression,
        matching: node => node.className === 'Person',
        inputValuesForFields: _node => new Map(),   // relevant for structural classes only
    })
    .inferenceRuleForFieldAccess({                  // `p.name`
        filter: isMemberAccess,
        matching: (node, classType) => typir.Inference.inferType(node.receiver) === classType,
        field: node => node.member,                 // field name, or a node to infer, or 'N/A'
    })
    .finish();
```

* For classes declared in user code, it is convenient to pass AST nodes as descriptors: `superClasses: node.superClassDeclaration` or a field `type: fieldNode.typeAnnotation`. Typir infers them through your other rules (including `inferenceRuleForClassDeclaration` of the other class) and waits until they exist. This is also how mutually referencing classes work.
* Kind options: `maximumNumberOfSuperClasses` (default 1), `subtypeFieldChecking` (default `'EQUAL_TYPE'`), `identifierPrefix` (default `'class'`), `typing`.
* Built-in validations: `createUniqueClassValidation`, `createUniqueMethodValidation({ isMethodDeclaration, getClassOfMethod, ... })`, `createNoSuperClassCyclesValidation({ isRelevant })`. All take `registration` (see `validation.md`).
* A `TopClassKind` exists for a common superclass of all classes (like `Object`).

## 6. Custom kinds

Use `CustomKind` when a type carries data that none of the predefined kinds model: matrices with dimensions, integer ranges, units of measure, and so on.

```typescript
import { CustomKind, isCustomType, PrimitiveType } from 'typir';

// properties must be declared with `type`, not `interface`
type MatrixProps = { baseType: PrimitiveType; width: number; height: number };

const matrixKind = new CustomKind<MatrixProps, MySpecifics>(typir, {
    name: 'Matrix', // unique per Typir instance
    calculateTypeIdentifier: p =>
        `matrix-${typir.infrastructure.TypeResolver.resolve(p.baseType).getIdentifier()}-${p.width}x${p.height}`,
    calculateTypeName: p => `Matrix<${p.baseType.getType()?.getName()}, ${p.width}x${p.height}>`,
});

const m2x2 = matrixKind.create({ properties: { baseType: typeInt, width: 2, height: 2 } })
    .inferenceRule({ filter: isMatrixLiteral, matching: node => node.rows === 2 && node.columns === 2 })
    .finish().getTypeFinal()!;

m2x2.properties.width;               // 2
m2x2.properties.baseType.getType();  // properties of type Type are stored as TypeReference
isCustomType(someType, matrixKind);  // type guard for this kind
```

* `create` deduplicates by identifier: creating the same properties again returns the existing type. That makes "get or create" inside a plain inference rule work well, which is the usual way to support infinitely many types (any width and height):

  ```typescript
  typir.Inference.addInferenceRule(node => {
      if (isMatrixLiteral(node)) {
          return matrixKind.create({ properties: { baseType: typeInt, width: node.columns, height: node.rows } })
              .finish().getTypeFinal()!;
      }
      return InferenceRuleNotApplicable;
  });
  ```

* Write `calculateTypeIdentifier` yourself whenever properties can contain strings or nested types; the default is generic and does not guarantee uniqueness.
* Re-creating an existing identifier with a different `typeName` or `typeUserRepresentation` throws.
* Type-valued properties take descriptors, but not plain identifier strings (wrap an identifier as `() => 'id'`). Arrays, sets, maps, nested objects, and optional properties are supported.
* Relationship hooks, all optional, are evaluated once for each new custom type:
  * subtyping: `getSuperTypesOfNewCustomType`, `getSubTypesOfNewCustomType`, `isNewCustomTypeSubTypeOf`, `isNewCustomTypeSuperTypeOf`
  * conversion: `getNewCustomTypeImplicitlyConvertibleToTypes`, `getTypesImplicitlyConvertibleToNewCustomType`, the `Explicitly` variants, and `isNewCustomTypeConvertibleToType` / `isTypeConvertibleToNewCustomType` returning a `ConversionMode`

  ```typescript
  type RangeProps = { max: number };
  const rangeKind = new CustomKind<RangeProps, MySpecifics>(typir, {
      name: 'Range',
      calculateTypeIdentifier: p => `range-${p.max}`,
      getSuperTypesOfNewCustomType: () => [typeInt],
      isNewCustomTypeConvertibleToType: (from, to) =>
          isCustomType(to, from.kind) && from.properties.max < to.properties.max ? 'IMPLICIT_EXPLICIT' : 'NONE',
  });
  ```

* To make the kind available everywhere as `typir.factory.Matrix`, register it as an additional service (see `customization.md`).

## 7. Parametric and multiplicity kinds (experimental)

`FixedParameterKind` (for `List<T>`, `Map<K, V>`) and `MultiplicityKind` (for `T[1..*]`) are exported but only lightly supported: they are not part of `typir.factory`, have no builder, and cannot register inference rules yet. Prefer a `CustomKind` with a type-valued property for generics in real projects, and mention the limitation to the user if they ask for these.

```typescript
const listKind = new FixedParameterKind(typir, 'List', { parameterSubtypeCheckingStrategy: 'EQUAL_TYPE' }, 'entry');
const listOfInt = listKind.createFixedParameterType({ parameterTypes: typeInt }); // returns the Type directly

const multiplicity = new MultiplicityKind(typir, { symbolForUnlimited: '*' });
const oneOrMoreStrings = multiplicity.createMultiplicityType({ constrainedType: typeString, lowerBound: 1, upperBound: MULTIPLICITY_UNLIMITED });
```

`parameterSubtypeCheckingStrategy` is one of `'EQUAL_TYPE' | 'ASSIGNABLE_TYPE' | 'SUB_TYPE'`.

## 8. Type descriptors, references, and the initialization lifecycle

Wherever Typir asks for a type (parameter types, field types, superclasses, custom properties), it accepts a `TypeDescriptor`:

* a `Type`
* a type identifier `string`
* a `TypeInitializer` (the result of `finish()`)
* a `TypeReference` (the result of `get(...)`)
* an AST node, whose type is inferred
* a function returning any of the above, evaluated lazily

`typir.infrastructure.TypeResolver.tryToResolve(descriptor)` returns the type or `undefined`; `resolve(descriptor)` throws instead.

Types move through three states: `'Invalid'` (dependencies missing), `'Identifiable'` (identifier known), and `'Completed'`. They advance on their own as the types they depend on appear, which is what makes cyclic definitions possible. Check with `type.getInitializationState()` or `type.isInStateOrLater('Completed')`.

To act once a delayed type is available:

```typescript
typir.factory.Classes.create({ ... }).finish().addListener(classType => {
    // called once the class type is identifiable (immediately, if it already is)
});
```

Inference rules should not depend on the initialization state of the type they infer, otherwise they break for cyclic definitions.
