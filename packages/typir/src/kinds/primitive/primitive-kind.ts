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
import { PrimitiveType } from './primitive-type.js';

export interface PrimitiveKindOptions {
    // empty for now
}

export interface PrimitiveTypeDetails extends TypeDetails {
    primitiveName: string;
}

interface CreatePrimitiveTypeDetails extends PrimitiveTypeDetails {
    inferenceRules: Array<InferCurrentTypeRule<unknown>>;
}

export const PrimitiveKindName = 'PrimitiveKind';

export interface PrimitiveFactoryService {
    create(typeDetails: PrimitiveTypeDetails): PrimitiveConfigurationChain;
    get(typeDetails: PrimitiveTypeDetails): PrimitiveType | undefined;
}

export interface PrimitiveConfigurationChain {
    inferenceRule<T>(rule: InferCurrentTypeRule<T>): PrimitiveConfigurationChain;
    finish(): PrimitiveType;
}

export class PrimitiveKind implements Kind, PrimitiveFactoryService {
    readonly $name: 'PrimitiveKind';
    readonly services: TypirServices;
    readonly options: PrimitiveKindOptions;

    constructor(services: TypirServices, options?: Partial<PrimitiveKindOptions>) {
        this.$name = PrimitiveKindName;
        this.services = services;
        this.services.infrastructure.Kinds.register(this);
        this.options = this.collectOptions(options);
    }

    protected collectOptions(options?: Partial<PrimitiveKindOptions>): PrimitiveKindOptions {
        return {
            ...options,
        };
    }

    get(typeDetails: PrimitiveTypeDetails): PrimitiveType | undefined {
        const key = this.calculateIdentifier(typeDetails);
        return this.services.infrastructure.Graph.getType(key) as PrimitiveType;
    }

    create(typeDetails: PrimitiveTypeDetails): PrimitiveConfigurationChain {
        assertTrue(this.get(typeDetails) === undefined); // ensure that the type is not created twice
        return new PrimitiveConfigurationChainImpl(this.services, this, typeDetails);
    }

    calculateIdentifier(typeDetails: PrimitiveTypeDetails): string {
        return typeDetails.primitiveName;
    }
}

export function isPrimitiveKind(kind: unknown): kind is PrimitiveKind {
    return isKind(kind) && kind.$name === PrimitiveKindName;
}


class PrimitiveConfigurationChainImpl implements PrimitiveConfigurationChain {
    protected readonly services: TypirServices;
    protected readonly kind: PrimitiveKind;
    protected readonly typeDetails: CreatePrimitiveTypeDetails;

    constructor(services: TypirServices, kind: PrimitiveKind, typeDetails: PrimitiveTypeDetails) {
        this.services = services;
        this.kind = kind;
        this.typeDetails = {
            ...typeDetails,
            inferenceRules: [],
        };
    }

    inferenceRule<T>(rule: InferCurrentTypeRule<T>): PrimitiveConfigurationChain {
        this.typeDetails.inferenceRules.push(rule as InferCurrentTypeRule<unknown>);
        return this;
    }

    finish(): PrimitiveType {
        // create the primitive type
        const currentPrimitiveType = new PrimitiveType(this.kind, this.kind.calculateIdentifier(this.typeDetails), this.typeDetails);
        this.services.infrastructure.Graph.addNode(currentPrimitiveType);

        // register the inference rules
        registerInferCurrentTypeRules(this.typeDetails.inferenceRules, currentPrimitiveType, this.services);

        return currentPrimitiveType;
    }
}
