/* eslint-disable header/header */
import { DefaultTypeAssignability, TypeAssignability } from './features/assignability';
import { DefaultTypeRelationshipCaching, TypeRelationshipCaching } from './features/caching';
import { DefaultTypeConversion, TypeConversion } from './features/conversion';
import { DefaultTypeEquality, TypeEquality } from './features/equality';
import { DefaultTypeInferenceCollector, TypeInferenceCollector } from './features/inference';
import { DefaultSubType, SubType } from './features/subtype';
import { TypeGraph } from './graph/type-graph';
import { Kind } from './kinds/kind';

export class Typir {
    graph: TypeGraph = new TypeGraph();
    kinds: Map<string, Kind> = new Map(); // name of kind => kind (for an easier look-up)

    // manage kinds
    registerKind(kind: Kind): void {
        this.kinds.set(kind.$name, kind);
    }
    getKind(type: string): Kind {
        if (this.kinds.has(type)) {
            return this.kinds.get(type)!;
        }
        throw new Error('missing kind ' + type);
    }

    // features
    assignability: TypeAssignability = new DefaultTypeAssignability(this);
    equality: TypeEquality = new DefaultTypeEquality(this);
    conversion: TypeConversion = new DefaultTypeConversion(this);
    subtype: SubType = new DefaultSubType(this);
    inference: TypeInferenceCollector = new DefaultTypeInferenceCollector(this);
    caching: TypeRelationshipCaching = new DefaultTypeRelationshipCaching(this);
}

/** Open design questions TODO
 * - use graphology for the TypeGraph?
 * - Must the name of types be unique?
 * - Where should inference rules be stored? only in the central service? in types? in kinds?
 */
