/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { describe, test } from 'vitest';
import { isClassType } from '../../../src/kinds/class/class-type.js';
import { isPrimitiveType } from '../../../src/kinds/primitive/primitive-type.js';
import { BooleanLiteral, ClassConstructorCall, ClassFieldAccess, IntegerLiteral, Variable } from '../../../src/test/predefined-language-nodes.js';
import { createTypirServicesForTesting, expectToBeType, expectTypirTypes, expectValidationIssuesStrict } from '../../../src/utils/test-utils.js';
import { assertTypirType } from '../../../src/utils/utils.js';

describe('Tests some details for class types', () => {

    test('create primitive and get it by name', () => {
        const typir = createTypirServicesForTesting();
        const classType1 = typir.factory.Classes
            .create({ className: 'MyClass1', fields: [], methods: [] }).finish()
            .getTypeFinal(); // since this class has no delayed dependencies, the new class type is directly available!
        assertTypirType(classType1, isClassType, 'MyClass1');
        expectTypirTypes(typir, isClassType, 'MyClass1');
    });

    test('infer types of accessed fields of a class (and validate them)', () => {
        const typir = createTypirServicesForTesting();
        const integerType = typir.factory.Primitives.create({ primitiveName: 'integer' })
            .inferenceRule({ filter: node => node instanceof IntegerLiteral }).finish();
        const booleanType = typir.factory.Primitives.create({ primitiveName: 'boolean' })
            .inferenceRule({ filter: node => node instanceof BooleanLiteral }).finish();
        const classType1 = typir.factory.Classes
            // a class with two fields with different primitive types
            .create({ className: 'MyClass1', fields: [
                { name: 'fieldInteger', type: integerType },
                { name: 'fieldBoolean', type: booleanType },
            ], methods: [] })
            // infer the type for constructor calls
            .inferenceRuleForClassLiterals({
                filter: node => node instanceof ClassConstructorCall,
                matching: node => node.className === 'MyClass1',
                inputValuesForFields: _node => new Map(),
                // a useless validation just for testing
                validation: (node, classType, accept, _typir) => accept({ languageNode: node, severity: 'error', message: `Called constructor for '${classType.getName()}'.` }),
            })
            // infer the type when accessing fields
            .inferenceRuleForFieldAccess({
                filter: node => node instanceof ClassFieldAccess,
                matching: (node, classType) => {
                    const variableType = typir.Inference.inferType(node.classVariable);
                    return variableType === classType;
                },
                field: node => node.fieldName,
                // a useless validation just for testing
                validation: (node, classType, accept) => {
                    if (node.fieldName === 'fieldBoolean') {
                        accept({ languageNode: node, severity: 'error', message: `Validated access of 'fieldBoolean' of the variable '${node.classVariable.name}'.` });
                    }
                },
            })
            .finish().getTypeFinal();
        assertTypirType(classType1, isClassType, 'MyClass1');
        typir.Inference.addInferenceRule((node: Variable) => node.initialValue, { languageKey: Variable.name }); // infer the type of variables


        // var1 := new MyClass1();
        const varClass = new Variable('var1', new ClassConstructorCall('MyClass1'));
        expectValidationIssuesStrict(typir, varClass.initialValue, ["Called constructor for 'MyClass1'."]);

        // var2 := var1.fieldInteger;
        const varFieldIntegerValue = new Variable('var2', new ClassFieldAccess(varClass, 'fieldInteger'));
        expectToBeType(typir.Inference.inferType(varFieldIntegerValue), isPrimitiveType, type => type.getName() === 'integer');
        expectValidationIssuesStrict(typir, varFieldIntegerValue.initialValue, []);

        // var3 := var1.fieldBoolean;
        const varFieldBooleanValue = new Variable('var3', new ClassFieldAccess(varClass, 'fieldBoolean'));
        expectToBeType(typir.Inference.inferType(varFieldBooleanValue), isPrimitiveType, type => type.getName() === 'boolean');
        expectValidationIssuesStrict(typir, varFieldBooleanValue.initialValue, ["Validated access of 'fieldBoolean' of the variable 'var1'."]);
    });

});
