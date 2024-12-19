grammar Lox

entry LoxProgram:
    elements+=LoxElement*;

LoxElement:
    Class |
    ExpressionBlock |
    IfStatement |
    WhileStatement |
    ForStatement |
    FunctionDeclaration |
    VariableDeclaration ';' |
    PrintStatement ';' |
    ReturnStatement ';' |
    Expression ';'
;

IfStatement:
    'if' '(' condition=Expression ')' block=ExpressionBlock
    ('else' elseBlock=ExpressionBlock)?
;

WhileStatement:
    'while' '(' condition=Expression ')' block=ExpressionBlock
;

ForStatement:
    'for' '(' counter=VariableDeclaration? ';' condition=Expression? ';' execution=Expression? ')' block=ExpressionBlock
;

PrintStatement: 'print' value=Expression;

ReturnStatement: 'return' value=Expression?;

ExpressionBlock: '{'
    elements+=LoxElement*
    '}';

VariableDeclaration returns NamedElement:
    {infer VariableDeclaration} 'var' name=ID (':' type=TypeReference)? (assignment?='=' value=Expression)?;

Expression:
    Assignment;

Assignment infers Expression:
    Addition ({infer BinaryExpression.left=current} operator=('=') right=Addition)*;

Addition infers Expression:
    Multiplication ({infer BinaryExpression.left=current} operator=('+' | '-') right=Multiplication)*;

Multiplication infers Expression:
    Logical ({infer BinaryExpression.left=current} operator=('*' | '/') right=Logical)*;

Logical infers Expression:
    Comparison ({infer BinaryExpression.left=current} operator=('and' | 'or') right=Comparison)*;

Comparison infers Expression:
    MemberCall ({infer BinaryExpression.left=current} operator=('<' | '<=' | '>' | '>=' | '==' | '!=') right=MemberCall)*;

MemberCall infers Expression:
    Primary
	(
        {infer MemberCall.previous=current}
        // Member call with function call
        (
            "." element=[NamedElement:ID]
            (
                explicitOperationCall?='('
                (
                    arguments+=Expression (',' arguments+=Expression)*
                )?
                ')'
            )?
            // Chained function call
            |
            (
                explicitOperationCall?='('
                (
                    arguments+=Expression (',' arguments+=Expression)*
                )?
                ')'
            )
        )
    )*;

Primary infers Expression:
    '(' Expression ')' |
    UnaryExpression |
    StringLiteral |
    BooleanLiteral |
    NumberLiteral |
    NilLiteral |
    FeatureCall;

FeatureCall infers Expression:
	{infer MemberCall}
	(element=[NamedElement:ID] | element=[NamedElement:'this'] | element=[NamedElement:'super'])
    // Optional function call after referencing an element
    (explicitOperationCall?='('
	(
	    arguments+=Expression (',' arguments+=Expression)*
	)?
	')')?;

UnaryExpression:
   operator=('!' | '-' | '+') value=Expression;

NumberLiteral: value=NUMBER;
StringLiteral: value=STRING;
BooleanLiteral: value?='true' | 'false';
NilLiteral: value='nil';

FunctionDeclaration:
    'fun' name=ID '(' (parameters+=Parameter (',' parameters+=Parameter)*)? ')' ':' returnType=TypeReference body=ExpressionBlock;

Parameter: name=ID ':' type=TypeReference;

Class: 'class' name=ID ('<' superClass=[Class:ID])? '{'
    members+=ClassMember*
    '}';

ClassMember: MethodMember | FieldMember;

MethodMember:
    name=ID '(' (parameters+=Parameter (',' parameters+=Parameter)*)? ')' ':' returnType=TypeReference body=ExpressionBlock;

FieldMember:
    name=ID ':' type=TypeReference;

TypeReference:
      reference=[Class:ID]
    | primitive=("string" | "number" | "boolean" | "void")
    | '(' ( parameters+=LambdaParameter (',' parameters+=LambdaParameter)*)? ')' '=>' returnType=TypeReference;

LambdaParameter: (name=ID ':')? type=TypeReference;

type NamedElement = Parameter | FunctionDeclaration | VariableDeclaration | MethodMember | FieldMember | Class;

hidden terminal WS: /\s+/;
terminal ID: /[_a-zA-Z][\w_]*/;
terminal NUMBER returns number: /[0-9]+(\.[0-9]+)?/;
terminal STRING: /"[^"]*"/;

hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
