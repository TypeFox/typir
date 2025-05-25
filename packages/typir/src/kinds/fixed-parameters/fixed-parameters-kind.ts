/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type, TypeDetails } from '../../graph/type-node.js';
import { TypirServices } from '../../typir.js';
import { TypeCheckStrategy } from '../../utils/utils-type-comparison.js';
import { assertTrue, toArray } from '../../utils/utils.js';
import { Kind } from '../kind.js';
import { FixedParameterType } from './fixed-parameters-type.js';

export class Parameter {
    readonly name: string;
    readonly index: number;

    constructor(name: string, index: number) {
        this.name = name;
        this.index = index;
    }
}

export interface FixedParameterTypeDetails<LanguageType> extends TypeDetails<LanguageType> {
    parameterTypes: Type | Type[]
}

export interface FixedParameterKindOptions {
    parameterSubtypeCheckingStrategy: TypeCheckStrategy,
}

export const FixedParameterKindName = 'FixedParameterKind';

/**
 * Suitable for kinds like Collection<T>, List<T>, Array<T>, Map<K, V>, ..., i.e. types with a fixed number of arbitrary parameter types
 */
export class FixedParameterKind<LanguageType> implements Kind {
    readonly $name: `FixedParameterKind-${string}`;
    readonly services: TypirServices<LanguageType>;
    readonly baseName: string;
    readonly options: Readonly<FixedParameterKindOptions>;
    readonly parameters: Parameter[]; // assumption: the parameters are in the correct order!

    constructor(typir: TypirServices<LanguageType>, baseName: string, options?: Partial<FixedParameterKindOptions>, ...parameterNames: string[]) {
        this.$name = `${FixedParameterKindName}-${baseName}`;
        this.services = typir;
        this.services.infrastructure.Kinds.register(this);
        this.baseName = baseName;
        this.options = this.collectOptions(options);
        this.parameters = parameterNames.map((name, index) => <Parameter>{ name, index });

        // check input
        assertTrue(this.parameters.length >= 1);
    }

    protected collectOptions(options?: Partial<FixedParameterKindOptions>): FixedParameterKindOptions {
        return {
            // the default values:
            parameterSubtypeCheckingStrategy: 'EQUAL_TYPE',
            // the actually overriden values:
            ...options
        };
    }

    getFixedParameterType(typeDetails: FixedParameterTypeDetails<LanguageType>): FixedParameterType | undefined {
        const key = this.calculateIdentifier(typeDetails);
        return this.services.infrastructure.Graph.getType(key) as FixedParameterType;
    }

    // the order of parameters matters!
    createFixedParameterType(typeDetails: FixedParameterTypeDetails<LanguageType>): FixedParameterType {
        assertTrue(this.getFixedParameterType(typeDetails) === undefined);

        // create the class type
        const typeWithParameters = new FixedParameterType(this as FixedParameterKind<unknown>, this.calculateIdentifier(typeDetails), typeDetails);
        this.services.infrastructure.Graph.addNode(typeWithParameters);

        this.registerInferenceRules(typeDetails, typeWithParameters);

        return typeWithParameters;
    }

    protected registerInferenceRules(_typeDetails: FixedParameterTypeDetails<LanguageType>, _typeWithParameters: FixedParameterType): void {
        // TODO
    }

    calculateIdentifier(typeDetails: FixedParameterTypeDetails<LanguageType>): string {
        return this.printSignature(this.baseName, toArray(typeDetails.parameterTypes), ','); // use the signature for a unique name
    }

    printSignature(baseName: string, parameterTypes: Type[], parameterSeparator: string): string {
        return `${baseName}<${parameterTypes.map(p => p.getName()).join(parameterSeparator)}>`;
    }

}

export function isFixedParametersKind<LanguageType>(kind: unknown): kind is FixedParameterKind<LanguageType> {
    return kind instanceof FixedParameterKind;
}
