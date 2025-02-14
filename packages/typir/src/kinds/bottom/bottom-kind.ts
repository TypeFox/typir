/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeDetails } from '../../graph/type-node.js';
import { TypirServices } from '../../typir.js';
import { InferCurrentTypeRule, registerInferCurrentTypeRules } from '../../utils/utils-definitions.js';
import { assertTrue } from '../../utils/utils.js';
import { isKind, Kind } from '../kind.js';
import { BottomType } from './bottom-type.js';

export interface BottomTypeDetails extends TypeDetails {
    /** In case of multiple inference rules, later rules are not evaluated anymore, if an earlier rule already matched. */
    inferenceRules?: InferCurrentTypeRule | InferCurrentTypeRule[]
}

export interface BottomKindOptions {
    name: string;
}

export const BottomKindName = 'BottomKind';

export interface BottomFactoryService {
    create(typeDetails: BottomTypeDetails): BottomType;
    get(typeDetails: BottomTypeDetails): BottomType | undefined;
}

export class BottomKind implements Kind, BottomFactoryService {
    readonly $name: 'BottomKind';
    readonly services: TypirServices;
    readonly options: Readonly<BottomKindOptions>;
    protected instance: BottomType | undefined;

    constructor(services: TypirServices, options?: Partial<BottomKindOptions>) {
        this.$name = BottomKindName;
        this.services = services;
        this.services.infrastructure.Kinds.register(this);
        this.options = this.collectOptions(options);
    }

    protected collectOptions(options?: Partial<BottomKindOptions>): BottomKindOptions {
        return {
            // the default values:
            name: 'never',
            // the actually overriden values:
            ...options
        };
    }

    get(typeDetails: BottomTypeDetails): BottomType | undefined {
        const key = this.calculateIdentifier(typeDetails);
        return this.services.infrastructure.Graph.getType(key) as BottomType;
    }

    create(typeDetails: BottomTypeDetails): BottomType {
        assertTrue(this.get(typeDetails) === undefined);
        // create the bottom type (singleton)
        if (this.instance) {
            // note, that the given inference rules are ignored in this case!
            return this.instance;
        }
        const bottomType = new BottomType(this, this.calculateIdentifier(typeDetails), typeDetails);
        this.instance = bottomType;
        this.services.infrastructure.Graph.addNode(bottomType);

        // register all inference rules for primitives within a single generic inference rule (in order to keep the number of "global" inference rules small)
        registerInferCurrentTypeRules(typeDetails.inferenceRules, bottomType, this.services);

        return bottomType;
    }

    calculateIdentifier(_typeDetails: BottomTypeDetails): string {
        return this.options.name;
    }

}

export function isBottomKind(kind: unknown): kind is BottomKind {
    return isKind(kind) && kind.$name === BottomKindName;
}
