/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { isMap, isSet } from 'util/types';
import { Type } from '../../graph/type-node.js';
import { TypeInitializer } from '../../initialization/type-initializer.js';
import { TypeReference } from '../../initialization/type-reference.js';
import { TypirProblem } from '../../utils/utils-definitions.js';
import { CustomTypeInitialization, CustomTypeProperties, CustomTypePropertyInitialization, CustomTypePropertyStorage, CustomTypePropertyTypes, CustomTypeStorage } from './custom-definitions.js';
import { CustomKind, CustomTypeDetails } from './custom-kind.js';
import { TypeSelector } from '../../initialization/type-selector.js';

export class CustomType<Properties extends CustomTypeProperties, LanguageType> extends Type {
    override readonly kind: CustomKind<Properties, LanguageType>;
    protected readonly typeName: string | undefined;
    protected readonly typeUserRepresentation?: string;
    readonly properties: CustomTypeStorage<Properties, LanguageType>;

    constructor(kind: CustomKind<Properties, LanguageType>, typeDetails: CustomTypeDetails<Properties, LanguageType>) {
        super(undefined, typeDetails);
        this.kind = kind;
        this.typeName = typeDetails.typeName;
        this.typeUserRepresentation = typeDetails.typeUserRepresentation;

        const collectedReferences: Array<TypeReference<Type, LanguageType>> = [];
        this.properties = this.replaceWhole(typeDetails.properties, collectedReferences) as CustomTypeStorage<Properties, LanguageType>;
        const allReferences: Array<TypeReference<Type, unknown>> = collectedReferences as Array<TypeReference<Type, unknown>>; // type-node.ts does not use <LanguageType>

        this.defineTheInitializationProcessOfThisType({
            preconditionsForIdentifiable: {
                referencesToBeIdentifiable: allReferences,
            },
            referencesRelevantForInvalidation: allReferences,
            onIdentifiable: () => {
                this.identifier = this.kind.calculateIdentifier(typeDetails);
            }
        }); // TODO Are there more preconditions? deregistration from listeners?
    }

    protected replaceWhole(properties: CustomTypeInitialization<CustomTypeProperties, LanguageType>, collectedReferences: Array<TypeReference<Type, LanguageType>>): CustomTypeStorage<CustomTypeProperties, LanguageType> {
        const result2: CustomTypeStorage<CustomTypeProperties, LanguageType> = {};
        for (const [key, value] of Object.entries(properties)) {
            const transformed: CustomTypePropertyStorage<CustomTypePropertyTypes, LanguageType> = this.replace(value, collectedReferences);
            result2[key] = transformed;
        }
        return result2;
        // for (const key in properties) {
        //     if (Object.prototype.hasOwnProperty.call(properties, key)) { // https://eslint.org/docs/latest/rules/guard-for-in
        //         const  value = properties[key];
        //         const transformed: CustomTypePropertyStorage<CustomTypePropertyTypes, LanguageType> = this.replace(value, collectedReferences);
        //         result[key] = transformed as CustomTypePropertyStorage<CustomTypePropertyTypes, LanguageType>;
        //     }
        // }
        // return result;
    }

    protected replace<T extends CustomTypePropertyTypes>(value: CustomTypePropertyInitialization<T, LanguageType>, collectedReferences: Array<TypeReference<Type, LanguageType>>): CustomTypePropertyStorage<T, LanguageType> {
        // TypeSelector --> TypeReference
        //      function
        //      Type
        //      string                              TODO: not unique, treat it as content!
        //      TypeInitializer
        //      TypeReference
        //      LanguageType                        TODO: ??
        // Array --> Array
        //      values: recursive transformation
        // Map --> Map
        //      values: recursive transformation
        // Set --> Set
        //      values: recursive transformation
        // primitives --> primitives
        //      string
        //      number
        //      boolean
        //      bigint
        if (typeof value === 'function') {
            const result = new TypeReference<Type, LanguageType>(value as TypeSelector<Type, LanguageType>, this.kind.services);
            collectedReferences.push(result);
            return result as unknown as CustomTypePropertyStorage<T, LanguageType>;
        } else if (value instanceof Type) {
            const result = new TypeReference<Type, LanguageType>(value, this.kind.services);
            collectedReferences.push(result);
            return result as unknown as CustomTypePropertyStorage<T, LanguageType>;
        } else if (value instanceof TypeInitializer) {
            const result = new TypeReference<Type, LanguageType>(value, this.kind.services);
            collectedReferences.push(result);
            return result as unknown as CustomTypePropertyStorage<T, LanguageType>;
        } else if (value instanceof TypeReference) {
            const result = new TypeReference<Type, LanguageType>(value, this.kind.services);
            collectedReferences.push(result);
            return result as unknown as CustomTypePropertyStorage<T, LanguageType>;
        } else if (this.kind.services.Language.isLanguageNode(value)) {
            const result = new TypeReference<Type, LanguageType>(value, this.kind.services);
            collectedReferences.push(result);
            return result as unknown as CustomTypePropertyStorage<T, LanguageType>;
        } else if (Array.isArray(value)) {
            return value.map(content => this.replace(content, collectedReferences)) as unknown as CustomTypePropertyStorage<T, LanguageType>;
        } else if (isSet(value)) {
            const result = new Set<CustomTypePropertyStorage<T, LanguageType>>();
            for (const entry of value) {
                result.add(this.replace(entry, collectedReferences));
            }
            return result as unknown as CustomTypePropertyStorage<T, LanguageType>;
        } else if (isMap(value)) {
            const result: Map<string, CustomTypePropertyStorage<T, LanguageType>> = new Map();
            value.forEach((key, content) => result.set(key, this.replace(content, collectedReferences)));
            return result as unknown as CustomTypePropertyStorage<T, LanguageType>;
        } else {
            return value as unknown as CustomTypePropertyStorage<T, LanguageType>;
        }
    }

    override getName(): string {
        return this.typeName ?? this.getIdentifier();
    }

    override getUserRepresentation(): string {
        return this.typeUserRepresentation ?? this.getName();
    }

    override analyzeTypeEqualityProblems(_otherType: Type): TypirProblem[] {
        throw new Error('Method not implemented.');
    }

}

export function isCustomType<Properties extends CustomTypeProperties, LanguageType>(type: unknown, kind: string | CustomKind<Properties, LanguageType>): type is CustomType<Properties, LanguageType> {
    return type instanceof CustomType && (typeof kind === 'string' ? type.kind.options.name === kind : type.kind === kind);
}
