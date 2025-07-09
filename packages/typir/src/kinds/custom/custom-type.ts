/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { isMap, isSet } from 'util/types';
import { Type } from '../../graph/type-node.js';
import { TypeInitializer } from '../../initialization/type-initializer.js';
import { TypeReference } from '../../initialization/type-reference.js';
import { TypeEqualityProblem } from '../../services/equality.js';
import { TypirProblem } from '../../utils/utils-definitions.js';
import { checkValueForConflict, createKindConflict, ValueConflict } from '../../utils/utils-type-comparison.js';
import { CustomTypeInitialization, CustomTypeProperties, CustomTypePropertyInitialization, CustomTypePropertyStorage, CustomTypePropertyTypes, CustomTypeStorage, TypeSelectorForCustomTypes } from './custom-definitions.js';
import { CustomKind, CustomTypeDetails } from './custom-kind.js';

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
        this.properties = this.replaceAllProperties(typeDetails.properties, collectedReferences) as CustomTypeStorage<Properties, LanguageType>;
        const allReferences: Array<TypeReference<Type, unknown>> = collectedReferences as Array<TypeReference<Type, unknown>>; // type-node.ts does not use <LanguageType>

        this.defineTheInitializationProcessOfThisType({
            preconditionsForIdentifiable: {
                referencesToBeIdentifiable: allReferences,
            },
            referencesRelevantForInvalidation: allReferences,
            onIdentifiable: () => {
                this.identifier = this.kind.calculateIdentifier(typeDetails.properties);
            }
        }); // TODO Are there more preconditions? deregistration from listeners?
    }

    protected replaceAllProperties(properties: CustomTypeInitialization<CustomTypeProperties, LanguageType>, collectedReferences: Array<TypeReference<Type, LanguageType>>): CustomTypeStorage<CustomTypeProperties, LanguageType> {
        // const result: CustomTypeStorage<CustomTypeProperties, LanguageType> = {}; // does not work, since the properties of CustomTypeStorage are defined as "readonly"!
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(properties)) {
            const transformed: CustomTypePropertyStorage<CustomTypePropertyTypes, LanguageType> = this.replaceSingleProperty(value, collectedReferences);
            result[key] = transformed;
        }
        return result as CustomTypeStorage<CustomTypeProperties, LanguageType>;
    }

    protected replaceSingleProperty<T extends CustomTypePropertyTypes>(value: CustomTypePropertyInitialization<T, LanguageType>, collectedReferences: Array<TypeReference<Type, LanguageType>>): CustomTypePropertyStorage<T, LanguageType> {
        // TypeSelector --> TypeReference
        //      function
        //      Type
        //      (string)                            forbidden/not supported, since it is not unique, treat it as content/primitive property!
        //      TypeInitializer
        //      TypeReference
        //      LanguageType                        additional "Language"-Service required to distinguish it from object with index signature
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
        //      symbol

        // all possible TypeSelectors
        if (typeof value === 'function') {
            const result = new TypeReference<Type, LanguageType>(value as TypeSelectorForCustomTypes<Type, LanguageType>, this.kind.services);
            collectedReferences.push(result);
            return result as unknown as CustomTypePropertyStorage<T, LanguageType>;
        } else if (value instanceof Type
            || value instanceof TypeInitializer
            || value instanceof TypeReference
            || this.kind.services.Language.isLanguageNode(value)
        ) {
            const result = new TypeReference<Type, LanguageType>(value, this.kind.services);
            collectedReferences.push(result);
            return result as unknown as CustomTypePropertyStorage<T, LanguageType>;
        }
        // grouping with Array, Set, Map
        else if (Array.isArray(value)) {
            return value.map(content => this.replaceSingleProperty(content, collectedReferences)) as unknown as CustomTypePropertyStorage<T, LanguageType>;
        } else if (isSet(value)) {
            const result = new Set<CustomTypePropertyStorage<T, LanguageType>>();
            for (const entry of value) {
                result.add(this.replaceSingleProperty(entry, collectedReferences));
            }
            return result as unknown as CustomTypePropertyStorage<T, LanguageType>;
        } else if (isMap(value)) {
            const result: Map<string, CustomTypePropertyStorage<T, LanguageType>> = new Map();
            value.forEach((content, key) => result.set(key, this.replaceSingleProperty(content, collectedReferences)));
            return result as unknown as CustomTypePropertyStorage<T, LanguageType>;
        }
        // primitives
        else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint' || typeof value === 'symbol') {
            return value as unknown as CustomTypePropertyStorage<T, LanguageType>;
        }
        // composite with recursive object / index signature
        else if (typeof value === 'object' && value !== null) {
            return this.replaceAllProperties(value as CustomTypeInitialization<CustomTypeProperties, LanguageType>, collectedReferences) as CustomTypePropertyStorage<T, LanguageType>;
        } else {
            throw new Error(`missing implementation for ${value}`);
        }
    }

    override getName(): string {
        return this.typeName // type-specific
            ?? this.kind.options.calculateTypeName?.call(this.kind.options.calculateTypeName, this.properties) // kind-specific
            ?? this.getIdentifier(); // fall-back
    }

    override getUserRepresentation(): string {
        return this.typeUserRepresentation // type-specific
            ?? this.kind.options.calculateTypeUserRepresentation?.call(this.kind.options.calculateTypeUserRepresentation, this.properties) // kind-specific
            ?? this.getName(); // fall-back
    }

    override analyzeTypeEqualityProblems(otherType: Type): TypirProblem[] {
        if (otherType instanceof CustomType) {
            if (otherType.kind.options.name === this.kind.options.name) {
                // TODO compare all properties
                return checkValueForConflict(this.getIdentifier(), otherType.getIdentifier(), 'name');
            } else {
                return [<TypeEqualityProblem>{
                    $problem: TypeEqualityProblem,
                    type1: this,
                    type2: otherType,
                    subProblems: [
                        <ValueConflict>{
                            $problem: ValueConflict,
                            firstValue: this.kind.options.name,
                            secondValue: otherType.kind.options.name,
                            location: 'kind',
                        },
                    ],
                }];
            }
        } else {
            return [<TypeEqualityProblem>{
                $problem: TypeEqualityProblem,
                type1: this,
                type2: otherType,
                subProblems: [createKindConflict(otherType, this)],
            }];
        }
    }

}

export function isCustomType<Properties extends CustomTypeProperties, LanguageType>(type: unknown, kind: string | CustomKind<Properties, LanguageType>): type is CustomType<Properties, LanguageType> {
    return type instanceof CustomType && (typeof kind === 'string' ? type.kind.options.name === kind : type.kind === kind);
}
