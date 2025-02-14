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

export const PrimitiveKindName = 'PrimitiveKind';

export interface PrimitiveFactoryService {
    create(typeDetails: PrimitiveTypeDetails): PrimitiveConfigurationChain;
    get(typeDetails: PrimitiveTypeDetails): PrimitiveType | undefined;
}

export interface PrimitiveConfigurationChain {
    inferenceRule<T>(rule: InferCurrentTypeRule<T>): PrimitiveConfigurationChain;
    finish(): PrimitiveType;
}

export class PrimitiveKind implements Kind, PrimitiveFactoryService, PrimitiveConfigurationChain {
    readonly $name: 'PrimitiveKind';
    readonly services: TypirServices;
    readonly options: PrimitiveKindOptions;

    /** Stores the current type under construction/configuration. */
    protected currentPrimitiveType: PrimitiveType | undefined = undefined;

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
        assertTrue(this.currentPrimitiveType === undefined, "There is already a type under construction. Use 'finish()' to complete its definition.");
        assertTrue(this.get(typeDetails) === undefined);

        // create the primitive type
        this.currentPrimitiveType = new PrimitiveType(this, this.calculateIdentifier(typeDetails), typeDetails);
        this.services.infrastructure.Graph.addNode(this.currentPrimitiveType);

        return this;
    }

    inferenceRule<T>(rule: InferCurrentTypeRule<T>): PrimitiveConfigurationChain {
        assertTrue(this.currentPrimitiveType !== undefined, "There is no type under construction at the moment. Use 'create(...)' to define a new type.");
        registerInferCurrentTypeRules(rule, this.currentPrimitiveType, this.services);
        return this;
    }

    finish(): PrimitiveType {
        assertTrue(this.currentPrimitiveType !== undefined, "There is no type under construction at the moment. Use 'create(...)' to define a new type.");
        const result = this.currentPrimitiveType;
        this.currentPrimitiveType = undefined;
        return result;
    }

    calculateIdentifier(typeDetails: PrimitiveTypeDetails): string {
        return typeDetails.primitiveName;
    }
}

export function isPrimitiveKind(kind: unknown): kind is PrimitiveKind {
    return isKind(kind) && kind.$name === PrimitiveKindName;
}
