// eslint-disable-next-line header/header
import { Type } from '../graph/type-node';

export interface TypeInference {
    inferType(domainElement: unknown): Type
}
