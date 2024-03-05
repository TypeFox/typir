// eslint-disable-next-line header/header
import { Type } from '../graph/type-graph';

export interface TypeInference {
    inferType(domainElement: unknown): Type
}
