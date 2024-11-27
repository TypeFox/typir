/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type } from '../../graph/type-node.js';
import { TypirServices } from '../../typir.js';
import { TypeCheckStrategy } from '../../utils/utils-type-comparison.js';
import { assertTrue, toArray } from '../../utils/utils.js';
import { Kind, isKind } from '../kind.js';
import { FixedParameterType } from './fixed-parameters-type.js';

export class Parameter {
    readonly name: string;
    readonly index: number;

    constructor(name: string, index: number) {
        this.name = name;
        this.index = index;
    }
}

export interface FixedParameterTypeDetails {
    parameterTypes: Type | Type[]
}

export interface FixedParameterKindOptions {
    parameterSubtypeCheckingStrategy: TypeCheckStrategy,
}

export const FixedParameterKindName = 'FixedParameterKind';

/**
 * Suitable for kinds like Collection<T>, List<T>, Array<T>, Map<K, V>, ..., i.e. types with a fixed number of arbitrary parameter types
 */
export class FixedParameterKind implements Kind {
    readonly $name: `FixedParameterKind-${string}`;
    readonly services: TypirServices;
    readonly baseName: string;
    readonly options: Readonly<FixedParameterKindOptions>;
    readonly parameters: Parameter[]; // assumption: the parameters are in the correct order!

    constructor(typir: TypirServices, baseName: string, options?: Partial<FixedParameterKindOptions>, ...parameterNames: string[]) {
        this.$name = `${FixedParameterKindName}-${baseName}`;
        this.services = typir;
        this.services.kinds.register(this);
        this.baseName = baseName;
        this.options = {
            // the default values:
            parameterSubtypeCheckingStrategy: 'EQUAL_TYPE',
            // the actually overriden values:
            ...options
        };
        this.parameters = parameterNames.map((name, index) => <Parameter>{ name, index });

        // check input
        assertTrue(this.parameters.length >= 1);
    }

    getFixedParameterType(typeDetails: FixedParameterTypeDetails): FixedParameterType | undefined {
        const key = this.calculateIdentifier(typeDetails);
        return this.services.graph.getType(key) as FixedParameterType;
    }

    getOrCreateFixedParameterType(typeDetails: FixedParameterTypeDetails): FixedParameterType {
        const typeWithParameters = this.getFixedParameterType(typeDetails);
        if (typeWithParameters) {
            this.registerInferenceRules(typeDetails, typeWithParameters);
            return typeWithParameters;
        }
        return this.createFixedParameterType(typeDetails);
    }

    // the order of parameters matters!
    createFixedParameterType(typeDetails: FixedParameterTypeDetails): FixedParameterType {
        assertTrue(this.getFixedParameterType(typeDetails) === undefined);

        // create the class type
        const typeWithParameters = new FixedParameterType(this, this.calculateIdentifier(typeDetails), ...toArray(typeDetails.parameterTypes));
        this.services.graph.addNode(typeWithParameters);

        this.registerInferenceRules(typeDetails, typeWithParameters);

        return typeWithParameters;
    }

    protected registerInferenceRules(_typeDetails: FixedParameterTypeDetails, _typeWithParameters: FixedParameterType): void {
        // TODO
    }

    calculateIdentifier(typeDetails: FixedParameterTypeDetails): string {
        return this.printSignature(this.baseName, toArray(typeDetails.parameterTypes), ','); // use the signature for a unique name
    }

    printSignature(baseName: string, parameterTypes: Type[], parameterSeparator: string): string {
        return `${baseName}<${parameterTypes.map(p => p.getName()).join(parameterSeparator)}>`;
    }

}

export function isFixedParametersKind(kind: unknown): kind is FixedParameterKind {
    return isKind(kind) && kind.$name.startsWith('FixedParameterKind-');
}
