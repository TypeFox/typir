# Typir

<div id="badges" align="center">

  [![npm](https://img.shields.io/npm/v/typir)](https://www.npmjs.com/package/typir)
  [![Build](https://github.com/TypeFox/typir/actions/workflows/actions.yml/badge.svg)](https://github.com/TypeFox/typir/actions/workflows/actions.yml)
  [![Github Discussions](https://img.shields.io/badge/github-discussions-blue?logo=github)](https://github.com/TypeFox/typir/discussions)
  [![Gitpod Ready-to-Code](https://img.shields.io/badge/Gitpod-ready--to--code-FFAE33?logo=gitpod)](https://gitpod.io/#https://github.com/TypeFox/typir)

</div>

---

Typir is a library for type systems and type checking for software languages in the web.

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
- Implementations for core type-checking services:
  - Assignability
  - Equality
  - Conversion (implicit/coercion and explicit/casting)
  - Type inference, i.e. determining the Typir type for a language node (e.g. an element of the current AST)
  - Sub-typing
  - Validation
- Solutions for: circular type definitions, caching, operators
- Meaningful and customizable error messages
- The provided default implementations are customizable by dependency injection

Typir does intentionally _not_ include ...

- Rule engines and constraint solving
- Formal proofs
- External DSLs for formalizing types


## NPM workspace

This repository is a NPM workspace. It contains the following packages:

- [Typir](./packages/typir/README.md) - the core package of Typir with default implementations for type checking services and some predefined types
- [Typir-Langium](./packages/typir-langium/README.md) - a binding of Typir for [Langium](https://github.com/eclipse-langium/langium), a language workbench for developing textual DSLs in the web,
in order to ease type checking for Langium-based languages

This repository contains the following stand-alone applications, which demonstrate how to use Typir for type checking:

- [LOX](./examples/lox/README.md) - static type checking for LOX, implemented with Typir-Langium
- [OX](./examples/ox/README.md) - a reduced version of LOX, implemented with Typir-Langium


## Tiny Typir Example

Both the LOX and OX examples have been created with Langium. Here is a very small example for using Typir with a tiny expression language, which is independent from any language workbench like Langium. We show how to use the Typir API for type checking of Tiny Typir. You can also find the example in the repository, implemented in form of an executable [test case](/packages/typir/test/api-example.test.ts).
Our Tiny Typir language has only a few concepts (all are realized as `AstElement`s), namely numbers (`NumberLiteral`), strings (`StringLiteral`), binary expressions (`BinaryExpression`), variables (`Variable`), and assignments (`AssignmentStatement`). They are implemented in a very simple way, see for example our `BinaryExpression`:

```
class BinaryExpression extends AstElement {
    constructor(
        public left: AstElement,
        public operator: string,
        public right: AstElement,
    ) { super(); }
}
```typescript

Feel free to check out the others in the [test code](/packages/typir/test/api-example.test.ts), but a little spoiler: no surprises there.

Let's head into setting up the Typir type system and creating the primitive types for our NumberLiteral and StringLiteral, which is a one line of code job each, as we use the Typir's predefined Primitives factory service:

```
const typir = createTypirServices();

const numberType = typir.factory.Primitives.create({ primitiveName: 'number', inferenceRules: node => node instanceof NumberLiteral });

const stringType = typir.factory.Primitives.create({ primitiveName: 'string', inferenceRules: node => node instanceof StringLiteral });
```typescript

Note that the inference rules are included in this. For the operators this is a bit longer, as we have to take care of the left and right operand and the operator of the binary expression, so we extract it and will resuse it later for both the `+` and `-` operators:

```
const inferenceRule: InferOperatorWithMultipleOperands<BinaryExpression> = {
    filter: node => node instanceof BinaryExpression,
    matching: (node, operatorName) => node.operator === operatorName,
    operands: node => [node.left, node.right],
};
```typescript

We wish to have two operators, the `+` operator, which should be overloaded to accept either two numbers to add or two strings to concatenate. This can be expressed with an array of signatures with different types for the operands and the return type of the operator. Furthermore, there is going to be a `-` operator with only one signature, since there is only subtraction of numbers. Both operators refer to the inferenceRule we defined above. `numberType` and `stringType` are the primitive types we defined above.

```
typir.factory.Operators.createBinary({ name: '+', signatures: [
    { left: numberType, right: numberType, return: numberType },
    { left: stringType, right: stringType, return: stringType },
], inferenceRule });
typir.factory.Operators.createBinary({ name: '-', signatures: [{ left: numberType, right: numberType, return: numberType }], inferenceRule });
```typescript

As we'd like to be able to convert numbers to strings implicitly, we add the following line. Note that this will for example make it possible to concatenate numbers and strings with the `+` operator, though it has no signature for a number and a string parameter in the operator definition above.

```
typir.Conversion.markAsConvertible(numberType, stringType,'IMPLICIT_EXPLICIT');
```typescript

Furthermore we can specify how Typir should infer the variable type. We decided that the type of the variable should be the type of its initial value. Typir internally considers the inference rules for primitives and operators as well, when recursively inferring the given AstElement.

```
typir.Inference.addInferenceRule(node => {
    if (node instanceof Variable) {
        return node.initialValue; // the type of the variable is the type of its initial value
    }
    return InferenceRuleNotApplicable;
});
```typescript

Finally, we add a type related validation rule for our small example: In case we have an AssignmentStatement, we check whether the type to be assigned is an assignable match for the variable type. We can do that with a custom message. An error with this message will show up for example when we try to assign the string literal "hello" to a number variable. It will not show up in case we assign the number literal 123 to a string variable, as we have defined the implicit conversion above.

```
typir.validation.Collector.addValidationRule(node => {
    if (node instanceof AssignmentStatement) {
        return typir.validation.Constraints.ensureNodeIsAssignable(node.right, node.left, (actual, expected) => <ValidationMessageDetails>{ message:
                    `The type '${actual.name}' is not assignable to the type '${expected.name}'.` });
    }
    return [];
});
```typescript

Wrapping this up, these are the test examples for the language usage with the expected type checking outcome:

```
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
```typescript

## Resources

Typir is presented in these talks:

- [LangDev'24](https://langdevcon.org/2024/program#26): [Video](https://www.youtube.com/watch?v=CL8EbJYeyTE), [slides](/resources/talks/2024-10-17-LangDev.pdf) (2024-10-17)
- [OCX/EclipseCon'24](https://www.ocxconf.org/event/778b82cc-6834-48a4-a58e-f883c5a7b8c9/agenda?session=23b97df9-0435-4fab-8a01-e0a9cf3e3831&shareLink=true): [Video](https://www.youtube.com/watch?v=WLzXAhcl-aY&list=PLy7t4z5SYNaRRGVdF83feN-_uHLwvGvgw&index=23), [slides](/resources/talks/2024-10-24-EclipseCon.pdf) (2024-10-24)


## Roadmap

The roadmap of Typir is organized with [milestones in GitHub](https://github.com/TypeFox/typir/milestones).

The roadmap include, among other, these features:

- More predefined types: structurally typed classes, lambdas, generics, constrained primitive types (e.g. numbers with upper and lower bound), ...
- Calculate types, e.g. operators whose return types depend on their current input types
- Optimized APIs to register rules for inference and validation

For the released versions of Typir, see the [CHANGELOG.md](/CHANGELOG.md).


## Contributing

Please read the [CONTRIBUTING.md](./CONTRIBUTING.md) for details on our code of conduct, and the process for submitting pull requests to us.

We also have a release process described in [RELEASE.md](./RELEASE.md).


## License

Typir is fully [MIT licensed](/LICENSE).
