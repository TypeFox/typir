/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { DefaultTypeAssignability, TypeAssignability } from './features/assignability.js';
import { DefaultDomainElementInferenceCaching, DefaultTypeRelationshipCaching, DomainElementInferenceCaching, TypeRelationshipCaching } from './features/caching.js';
import { DefaultTypeConversion, TypeConversion } from './features/conversion.js';
import { DefaultTypeEquality, TypeEquality } from './features/equality.js';
import { DefaultTypeInferenceCollector, TypeInferenceCollector } from './features/inference.js';
import { DefaultOperatorManager, OperatorManager } from './features/operator.js';
import { DefaultTypeConflictPrinter, ProblemPrinter } from './features/printing.js';
import { DefaultSubType, SubType } from './features/subtype.js';
import { DefaultValidationCollector, DefaultValidationConstraints, ValidationCollector, ValidationConstraints } from './features/validation.js';
import { TypeGraph } from './graph/type-graph.js';
import { Kind } from './kinds/kind.js';

/**
 * Design decisions for Typir
 * - no NameProvider for the name of types, since the name depends on the type of the kind => change the implementation of the kind
 * - the type 'void' has a primitive kind (no dedicated kind for now)
 */

/** Open design questions TODO
 * - use graphology for the TypeGraph?
 * - Where should inference rules be stored? only in the central service? in types? in kinds?
 * - Type is generic VS there are specific types like FunctionType (extends Type)?? functionType.kind.getOutput(functionKind) + isFunctionKind() feels bad! vs functionType.getOutput() + isFunctionType()
 * - realize "unknown" as a generic "<T = unknown>" for whole Typir? for the Langium binding T would be AstNode!
 * - Is it easy to use two different Typir instances side-by-side within the same application?
 * - How to bundle Typir configurations for reuse ("presets")?
 * - How to handle cycles?
 *     - Cycles at types: MyClass { myField?: MyClass, myFunction(operand: MyClass) }, MyClass<T extends MyClass<T>> to return typed sub-class instances
 *     - Cycles at instances/objects: Parent used as Child?!
 */

/** TODO missing things
 * - support dedicated inference rules for all kinds
 * - separate kinds for bottom and top types!
 */

export class Typir {
    // store types and kinds
    graph: TypeGraph = new TypeGraph();
    kinds: Map<string, Kind> = new Map(); // name of kind => kind (for an easier look-up)

    // features
    assignability: TypeAssignability;
    equality: TypeEquality;
    conversion: TypeConversion;
    subtype: SubType;
    inference: TypeInferenceCollector;
    caching: {
        typeRelationships: TypeRelationshipCaching;
        domainElementInference: DomainElementInferenceCaching;
    };
    operators: OperatorManager;
    printer: ProblemPrinter;
    validation: {
        collector: ValidationCollector;
        constraints: ValidationConstraints;
    };

    constructor() {
        this.assignability = new DefaultTypeAssignability(this);
        this.equality = new DefaultTypeEquality(this);
        this.conversion = new DefaultTypeConversion(this);
        this.subtype = new DefaultSubType(this);
        this.caching = {
            typeRelationships: new DefaultTypeRelationshipCaching(this),
            domainElementInference: new DefaultDomainElementInferenceCaching(this), // cached inference results, intended to be used by multiple inferring instances, other services should use the central inference service nevertheless
        };
        this.inference = new DefaultTypeInferenceCollector(this);
        this.operators = new DefaultOperatorManager(this);
        this.printer = new DefaultTypeConflictPrinter(this);
        this.validation = {
            collector: new DefaultValidationCollector(this),
            constraints: new DefaultValidationConstraints(this),
        };
    }

    // manage kinds
    registerKind(kind: Kind): void {
        const key = kind.$name;
        if (this.kinds.has(key)) {
            if (this.kinds.get(key) === kind) {
                // that is OK
            } else {
                throw new Error(`duplicate kind named '${key}'`);
            }
        } else {
            this.kinds.set(key, kind);
        }
    }

    getKind(type: string): Kind | undefined {
        return this.kinds.get(type)!;
    }
}
