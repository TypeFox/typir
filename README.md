<div id="typir-logo" align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./resources/logo/logo-white.svg" sizes="40vw"/>
    <source media="(prefers-color-scheme: light)" srcset="./resources/logo/logo-black.svg" sizes="40vw"/>
    <img alt="Typir logo including the name 'typir' and a stylised tapir" src="./resources/logo/logo-black.svg" width="40%"/>
  </picture>
  <h3>
    the library for type systems and type checking for software languages in the web
  </h3>
</div>

<div id="badges" align="center">

  [![npm](https://img.shields.io/npm/v/typir)](https://www.npmjs.com/package/typir)
  [![Build](https://github.com/TypeFox/typir/actions/workflows/actions.yml/badge.svg)](https://github.com/TypeFox/typir/actions/workflows/actions.yml)
  [![Github Discussions](https://img.shields.io/badge/github-discussions-blue?logo=github)](https://github.com/TypeFox/typir/discussions)
  [![Gitpod Ready-to-Code](https://img.shields.io/badge/Gitpod-ready--to--code-FFAE33?logo=gitpod)](https://gitpod.io/#https://github.com/TypeFox/typir)

</div>

---

Typir is OpenSource, written in TypeScript, and follows pragmatic approaches for simplifying type checking in practical language engineering projects by providing default implementations for recurring problems.
As a stand-alone library, Typir provides a TypeScript-API for language engineers without an additional, external DSL for formalizing types.


## Core Features

Typir provides these core features:

- Predefined types:
  - Primitives
  - Functions (with overloading)
  - Classes
  - Top, bottom
  - (more are planned)
- Operators (with overloading)
- Implementations for core type-checking services:
  - Assignability
  - Equality
  - Conversion (implicit/coercion and explicit/casting)
  - Type inference, i.e. determining the Typir type for a language node (e.g. an element of the current AST)
  - Sub-typing
  - Validation
- Circular type definitions (e.g. `Node { children: Node[] }`)
- Caching
- Meaningful and customizable error messages
- The provided default implementations are customizable by dependency injection

Typir does intentionally _not_ include ...

- Rule engines and constraint solving,
  since type inference is calculated in a recursive manner and does not use unification/substitution
- Formal proofs
- External DSLs for formalizing types
- Support for dynamic type systems, which perform type checking during the execution of the DSL.
  Typir aims at static type systems, which perform type checking during the writing of the DSL.


## NPM workspace

This repository is a NPM workspace. It contains the following packages:

- [Typir](./packages/typir/README.md) is the core package of Typir with default implementations for type checking services and some predefined types. Typir is published as `typir` at [NPM](https://www.npmjs.com/package/typir?activeTab=versions).
- [Typir-Langium](./packages/typir-langium/README.md) is the binding of Typir for [Langium](https://github.com/eclipse-langium/langium), a language workbench for developing textual DSLs in the web,
in order to ease type checking for Langium-based languages. Typir-Langium is published as `typir-langium` at [NPM](https://www.npmjs.com/package/typir-langium?activeTab=versions).

This repository contains the following stand-alone applications, which demonstrate how to use Typir for type checking:

- [LOX](./examples/lox/README.md) - static type checking for LOX, implemented with Typir-Langium
- [OX](./examples/ox/README.md) - a reduced version of LOX, implemented with Typir-Langium
- [Expression](./examples/expression/README.md) - a handwritten parser for a simple expression language with type checking implemented with Typir (core)


## Documentation

A work-in-progress documentation in Markdown format is provided in the [documentation/](./documentation/) folder in this repository, which will be extended step-by-step and integrated soon into [typir.org](https://www.typir.org).


## Tiny Typir Example

Both the LOX and OX examples have been created with Langium. Here is a very small example for using Typir with a tiny expression language, which is independent from any language workbench like Langium. We show how to use the Typir API for type checking of Tiny Typir. You can also find the example in the repository, implemented in form of an executable [test case](./packages/typir/test/api-example.test.ts).
Our Tiny Typir language has only a few concepts (all are realized as `AstElement`s), namely numbers (`NumberLiteral`), strings (`StringLiteral`), binary expressions (`BinaryExpression`), variables (`Variable`), and assignments (`AssignmentStatement`). They are implemented in a very simple way, see for example our `BinaryExpression`:

```typescript
class BinaryExpression extends AstElement {
    constructor(
        public left: AstElement,
        public operator: string,
        public right: AstElement,
    ) { super(); }
}
```

Feel free to check out the others in the [test code](./packages/typir/test/api-example.test.ts), but a little spoiler: no surprises there.

Let's head into setting up the Typir type system and creating the primitive types for our NumberLiteral and StringLiteral, which is a one line of code job each, as we use the Typir's predefined Primitives factory service:

```typescript
interface TinyTypirSpecifics extends TypirSpecifics { LanguageType: AstElement } // `AstElement` is the root type of all language nodes in the AST
const typir = createTypirServices<TinyTypirSpecifics>(); // set-up the type system with the specifics of the "Tiny Typir" example as <TinySpecifics>

const numberType = typir.factory.Primitives.create({ primitiveName: 'number' }).inferenceRule({ filter: node => node instanceof NumberLiteral }).finish();

const stringType = typir.factory.Primitives.create({ primitiveName: 'string' }).inferenceRule({ filter: node => node instanceof StringLiteral }).finish();
```

Note that the inference rules are included in this. For the operators this is a bit longer, as we have to take care of the left and right operand and the operator of the binary expression, so we extract it and will resuse it later for both the `+` and `-` operators:

```typescript
const inferenceRule: InferOperatorWithMultipleOperands<TinyTypirSpecifics, BinaryExpression> = {
    filter: node => node instanceof BinaryExpression,
    matching: (node, operatorName) => node.operator === operatorName,
    operands: node => [node.left, node.right],
    validateArgumentsOfCalls: true, // explicitly request to check, that the types of the arguments in operator calls fit to the parameters
};
```

We wish to have two operators, the `+` operator, which should be overloaded to accept either two numbers to add or two strings to concatenate. This can be expressed with an array of signatures with different types for the operands and the return type of the operator. Furthermore, there is going to be a `-` operator with only one signature, since there is only subtraction of numbers. Both operators refer to the inferenceRule we defined above. `numberType` and `stringType` are the primitive types we defined above.

```typescript
typir.factory.Operators.createBinary({ name: '+', signatures: [
    { left: numberType, right: numberType, return: numberType },
    { left: stringType, right: stringType, return: stringType },
] }).inferenceRule(inferenceRule).finish();
typir.factory.Operators.createBinary({ name: '-', signatures: [{ left: numberType, right: numberType, return: numberType }] }).inferenceRule(inferenceRule).finish();
```

As we'd like to be able to convert numbers to strings implicitly, we add the following line. Note that this will for example make it possible to concatenate numbers and strings with the `+` operator, though it has no signature for a number and a string parameter in the operator definition above.

```typescript
typir.Conversion.markAsConvertible(numberType, stringType, 'IMPLICIT_EXPLICIT');
```

Furthermore we can specify how Typir should infer the variable type. We decided that the type of the variable should be the type of its initial value. Typir internally considers the inference rules for primitives and operators as well, when recursively inferring the given AstElement.

```typescript
typir.Inference.addInferenceRule(node => {
    if (node instanceof Variable) {
        return node.initialValue; // the type of the variable is the type of its initial value
    }
    return InferenceRuleNotApplicable;
});
```

Finally, we add a type related validation rule for our small example: In case we have an AssignmentStatement, we check whether the type to be assigned is an assignable match for the variable type. We can do that with a custom message. An error with this message will show up for example when we try to assign the string literal "hello" to a number variable. It will not show up in case we assign the number literal 123 to a string variable, as we have defined the implicit conversion above.

```typescript
typir.validation.Collector.addValidationRule((node, accept) => {
    if (node instanceof AssignmentStatement) {
        typir.validation.Constraints.ensureNodeIsAssignable(node.right, node.left, accept, (actual, expected) => ({ message:
            `The type '${actual.name}' is not assignable to the type '${expected.name}'.` }));
    }
});
```

Wrapping this up, these are the test examples for the language usage with the expected type checking outcome:

```typescript
// 2 + 3 => OK
const example1 = new BinaryExpression(new NumberLiteral(2), '+', new NumberLiteral(3));
expect(typir.validation.Collector.validate(example1)).toHaveLength(0);

// 2 + "3" => OK
const example2 = new BinaryExpression(new NumberLiteral(2), '+', new StringLiteral('3'));
expect(typir.validation.Collector.validate(example2)).toHaveLength(0);

// 2 - "3" => wrong
const example3 = new BinaryExpression(new NumberLiteral(2), '-', new StringLiteral('3'));
const errors1 = typir.validation.Collector.validate(example3);
const errorStack = typir.Printer.printTypirProblem(errors1[0]); // the problem comes with detailed "sub-problems"
expect(errorStack).includes("The parameter 'right' at index 1 got a value with a wrong type.");
expect(errorStack).includes("For property 'right', the types 'string' and 'number' do not match.");

// 123 is assignable to a string variable
const varString = new Variable('v1', new StringLiteral('Hello'));
const assignNumberToString = new AssignmentStatement(varString, new NumberLiteral(123));
expect(typir.validation.Collector.validate(assignNumberToString)).toHaveLength(0);

// "123" is not assignable to a number variable
const varNumber = new Variable('v2', new NumberLiteral(456));
const assignStringToNumber = new AssignmentStatement(varNumber, new StringLiteral('123'));
const errors2 = typir.validation.Collector.validate(assignStringToNumber);
expect(errors2[0].message).toBe("The type 'string' is not assignable to the type 'number'.");
```

## Resources

Typir is presented in these talks:

- [LangDev'24](https://langdevcon.org/2024/program#26): [Video](https://www.youtube.com/watch?v=CL8EbJYeyTE), [slides](./resources/talks/2024-10-17-LangDev.pdf) (2024-10-17)
- [OCX/EclipseCon'24](https://www.ocxconf.org/event/778b82cc-6834-48a4-a58e-f883c5a7b8c9/agenda?session=23b97df9-0435-4fab-8a01-e0a9cf3e3831&shareLink=true): [Video](https://www.youtube.com/watch?v=WLzXAhcl-aY&list=PLy7t4z5SYNaRRGVdF83feN-_uHLwvGvgw&index=23), [slides](./resources/talks/2024-10-24-EclipseCon.pdf) (2024-10-24)

Blog posts about Typir:

- [Announcing Typir](https://www.typefox.io/blog/typir-introduction/) (2025-06-06)


## Roadmap

The roadmap of Typir is organized with [milestones in GitHub](https://github.com/TypeFox/typir/milestones).

The roadmap includes, among other, these features:

- More predefined types: structurally typed classes, lambdas, generics, constrained primitive types (e.g. numbers with upper and lower bound), ...
- Calculate types, e.g. operators whose return types depend on their current input types

For the released versions of Typir, see the [CHANGELOG.md](./CHANGELOG.md).


## Contributing

Please read the [CONTRIBUTING.md](./CONTRIBUTING.md) for details on our code of conduct, and the process for submitting pull requests to us.

We also have a release process described in [RELEASE.md](./RELEASE.md).


## License

Typir is fully [MIT licensed](./LICENSE).
