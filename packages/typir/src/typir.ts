/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { DefaultTypeAssignability, TypeAssignability } from './features/assignability.js';
import { DefaultTypeRelationshipCaching, TypeRelationshipCaching } from './features/caching.js';
import { DefaultTypeConversion, TypeConversion } from './features/conversion.js';
import { DefaultTypeEquality, TypeEquality } from './features/equality.js';
import { DefaultTypeInferenceCollector, TypeInferenceCollector } from './features/inference.js';
import { DefaultOperatorManager, OperatorManager } from './features/operator.js';
import { DefaultSubType, SubType } from './features/subtype.js';
import { TypeGraph } from './graph/type-graph.js';
import { Kind } from './kinds/kind.js';

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
    caching: TypeRelationshipCaching;
    operators: OperatorManager;

    constructor() {
        this.assignability = new DefaultTypeAssignability(this);
        this.equality = new DefaultTypeEquality(this);
        this.conversion = new DefaultTypeConversion(this);
        this.subtype = new DefaultSubType(this);
        this.inference = new DefaultTypeInferenceCollector(this);
        this.caching = new DefaultTypeRelationshipCaching(this);
        this.operators = new DefaultOperatorManager(this);
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

/** Open design questions TODO
 * - use graphology for the TypeGraph?
 * - Must the name of types be unique?
 * - Where should inference rules be stored? only in the central service? in types? in kinds?
 */
