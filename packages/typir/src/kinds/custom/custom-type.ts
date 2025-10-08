/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { isMap, isSet } from 'util/types';
import { AnalyzeEqualityOptions, Type } from '../../graph/type-node.js';
import { TypeInitializer } from '../../initialization/type-initializer.js';
import { TypeReference } from '../../initialization/type-reference.js';
import { TypeEqualityProblem } from '../../services/equality.js';
import { TypirSpecifics } from '../../typir.js';
import { TypirProblem } from '../../utils/utils-definitions.js';
import { checkTypes, checkValueForConflict, createKindConflict, createTypeCheckStrategy, ValueConflict } from '../../utils/utils-type-comparison.js';
import { assertTrue } from '../../utils/utils.js';
import { CustomTypeInitialization, CustomTypeProperties, CustomTypePropertyInitialization, CustomTypePropertyStorage, CustomTypePropertyTypes, CustomTypeStorage, TypeDescriptorForCustomTypes } from './custom-definitions.js';
import { CustomKind, CustomTypeDetails } from './custom-kind.js';
import { TypeGraphListener } from '../../graph/type-graph.js';

export class CustomType<Properties extends CustomTypeProperties, Specifics extends TypirSpecifics> extends Type implements TypeGraphListener {
    override readonly kind: CustomKind<Properties, Specifics>;
    protected readonly typeName: string | undefined;
    protected readonly typeUserRepresentation?: string;
    readonly properties: CustomTypeStorage<Properties, Specifics>;

    constructor(kind: CustomKind<Properties, Specifics>, typeDetails: CustomTypeDetails<Properties, Specifics>) {
        super(undefined, typeDetails);
        this.kind = kind;
        this.typeName = typeDetails.typeName;
        this.typeUserRepresentation = typeDetails.typeUserRepresentation;

        const collectedReferences: Array<TypeReference<Type, Specifics>> = [];
        this.properties = this.replaceAllProperties(typeDetails.properties, collectedReferences) as CustomTypeStorage<Properties, Specifics>;
        const allReferences = collectedReferences as unknown as Array<TypeReference<Type, TypirSpecifics>>; // type-node.ts does not use <TypirSpecifics>

        this.defineTheInitializationProcessOfThisType({
            preconditionsForIdentifiable: {
                referencesToBeIdentifiable: allReferences,
            },
            referencesRelevantForInvalidation: allReferences,
            onIdentifiable: () => {
                this.identifier = this.kind.calculateIdentifier(typeDetails.properties);
                if (this.needsTypeNotifications()) {
                    this.kind.services.infrastructure.Graph.addListener(this, { callOnAddedForAllExisting: true });
                }
            },
            onInvalidated: () => {
                if (this.needsTypeNotifications()) {
                    this.kind.services.infrastructure.Graph.removeListener(this);
                }
            }
        });
    }

    protected replaceAllProperties(properties: CustomTypeInitialization<CustomTypeProperties, Specifics>, collectedReferences: Array<TypeReference<Type, Specifics>>): CustomTypeStorage<CustomTypeProperties, Specifics> {
        // const result: CustomTypeStorage<CustomTypeProperties, Specifics> = {}; // does not work, since the properties of CustomTypeStorage are defined as "readonly"!
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(properties)) {
            const transformed: CustomTypePropertyStorage<CustomTypePropertyTypes, Specifics> = this.replaceSingleProperty(value, collectedReferences);
            result[key] = transformed;
        }
        return result as CustomTypeStorage<CustomTypeProperties, Specifics>;
    }

    protected replaceSingleProperty<T extends CustomTypePropertyTypes>(value: CustomTypePropertyInitialization<T, Specifics>, collectedReferences: Array<TypeReference<Type, Specifics>>): CustomTypePropertyStorage<T, Specifics> {
        // TypeDescriptor --> TypeReference
        //      function
        //      Type
        //      (string)                            forbidden/not supported, since it is not unique, treat it as content/primitive property!
        //      TypeInitializer
        //      TypeReference
        //      Specifics['LanguageType']           additional "Language"-Service required to distinguish it from object with index signature
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

        // all possible TypeDescriptors
        if (typeof value === 'function') {
            const result = new TypeReference<Type, Specifics>(value as TypeDescriptorForCustomTypes<Type, Specifics>, this.kind.services);
            collectedReferences.push(result);
            this.kind.services.infrastructure.RelationshipUpdater.markUseAsRelevantForEquality(this, result);
            return result as unknown as CustomTypePropertyStorage<T, Specifics>;
        } else if (value instanceof Type
            || value instanceof TypeInitializer
            || value instanceof TypeReference
            || this.kind.services.Language.isLanguageNode(value)
        ) {
            const result = new TypeReference<Type, Specifics>(value, this.kind.services);
            collectedReferences.push(result);
            this.kind.services.infrastructure.RelationshipUpdater.markUseAsRelevantForEquality(this, result);
            return result as unknown as CustomTypePropertyStorage<T, Specifics>;
        }
        // grouping with Array, Set, Map
        else if (Array.isArray(value)) {
            return value.map(content => this.replaceSingleProperty(content, collectedReferences)) as unknown as CustomTypePropertyStorage<T, Specifics>;
        } else if (isSet(value)) {
            const result = new Set<CustomTypePropertyStorage<T, Specifics>>();
            for (const entry of value) {
                result.add(this.replaceSingleProperty(entry, collectedReferences));
            }
            return result as unknown as CustomTypePropertyStorage<T, Specifics>;
        } else if (isMap(value)) {
            const result: Map<string, CustomTypePropertyStorage<T, Specifics>> = new Map();
            value.forEach((content, key) => result.set(key, this.replaceSingleProperty(content, collectedReferences)));
            return result as unknown as CustomTypePropertyStorage<T, Specifics>;
        }
        // primitives
        else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint' || typeof value === 'symbol') {
            return value as unknown as CustomTypePropertyStorage<T, Specifics>;
        }
        // composite with recursive object / index signature
        else if (typeof value === 'object' && value !== null) {
            return this.replaceAllProperties(value as CustomTypeInitialization<CustomTypeProperties, Specifics>, collectedReferences) as CustomTypePropertyStorage<T, Specifics>;
        } else {
            throw new Error(`missing implementation for ${String(value)}`);
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


    protected needsTypeNotifications(): boolean {
        const options = this.kind.options;
        return options.isNewCustomTypeSubTypeOf !== undefined || options.isNewCustomTypeSuperTypeOf !== undefined ||
            options.isNewCustomTypeConvertibleToType !== undefined || options.isTypeConvertibleToNewCustomType !== undefined ||
            options.isNewCustomTypeEqualTo !== undefined;
    }

    onAddedType(newOtherType: Type, _key: string): void {
        if (newOtherType !== this) { // don't relate the custom type to itself
            const options = this.kind.options;

            // sub-type
            if (options.isNewCustomTypeSubTypeOf?.call(options.isNewCustomTypeSubTypeOf, this, newOtherType)) {
                this.kind.services.Subtype.markAsSubType(this, newOtherType, { checkForCycles: false });
            }
            if (options.isNewCustomTypeSuperTypeOf?.call(options.isNewCustomTypeSuperTypeOf, newOtherType, this)) {
                this.kind.services.Subtype.markAsSubType(newOtherType, this, { checkForCycles: false });
            }

            // conversion
            const convertCustomToOther = options.isNewCustomTypeConvertibleToType?.call(options.isNewCustomTypeConvertibleToType, this, newOtherType) ?? 'NONE';
            if (convertCustomToOther === 'IMPLICIT_EXPLICIT' || convertCustomToOther === 'EXPLICIT') {
                this.kind.services.Conversion.markAsConvertible(this, newOtherType, convertCustomToOther);
            }
            const convertOtherToCustom = options.isTypeConvertibleToNewCustomType?.call(options.isTypeConvertibleToNewCustomType, newOtherType, this) ?? 'NONE';
            if (convertOtherToCustom === 'IMPLICIT_EXPLICIT' || convertOtherToCustom === 'EXPLICIT') {
                this.kind.services.Conversion.markAsConvertible(newOtherType, this, convertOtherToCustom);
            }

            // equality
            if (options.isNewCustomTypeEqualTo?.call(options.isNewCustomTypeEqualTo, this, newOtherType)) {
                this.kind.services.Equality.markAsEqual(this, newOtherType);
            }
        }
    }

    override analyzeTypeEquality(otherType: Type, options?: AnalyzeEqualityOptions): boolean | TypirProblem[] {
        if (isCustomType(otherType, this.kind)) {
            const subProblems = this.analyzeTypeEqualityProblemsAll(this.properties, otherType.properties, !!options?.failFast);
            if (subProblems.length >= 1) {
                return [<TypeEqualityProblem>{
                    $problem: TypeEqualityProblem,
                    type1: this,
                    type2: otherType,
                    subProblems,
                }];
            } else {
                return [];
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

    protected analyzeTypeEqualityProblemsAll(properties1: CustomTypeStorage<Properties, Specifics>, properties2: CustomTypeStorage<Properties, Specifics>, failFast: boolean): TypirProblem[] {
        const result: TypirProblem[] = [];
        for (const [key, value1] of Object.entries(properties1)) {
            const value2 = properties2[key];
            const subProblems = this.analyzeTypeEqualityProblemsSingle(value1, value2, failFast);
            if (subProblems.length >= 1) {
                result.push(<ValueConflict>{
                    $problem: ValueConflict,
                    location: key,
                    firstValue: value1,
                    secondValue: value2,
                    subProblems,
                });
                if (failFast) { return result; }
            }
        }
        return result;
    }

    protected analyzeTypeEqualityProblemsSingle<T extends CustomTypePropertyTypes>(value1: CustomTypePropertyStorage<T, Specifics>, value2: CustomTypePropertyStorage<T, Specifics>, failFast: boolean): TypirProblem[] {
        if (typeof value1 !== typeof value2) {
            // this case might occur for optional properties, since `undefined` is a different TypeScript type than a non-undefined value
            return [<ValueConflict>{
                $problem: ValueConflict,
                firstValue: typeof value1,
                secondValue: typeof value2,
            }];
        }
        // a type is stored in a TypeReference!
        if (value1 instanceof TypeReference) {
            return checkTypes(value1.getType(), (value2 as TypeReference<Type, Specifics>).getType(), createTypeCheckStrategy('EQUAL_TYPE', this.kind.services), false);
        }
        // grouping with Array, Set, Map
        else if (Array.isArray(value1)) {
            assertTrue(Array.isArray(value2));
            const sizeProblem = checkValueForConflict(value1.length, value2.length, 'length');
            if (sizeProblem.length >= 1) {
                return sizeProblem;
            }
            const contentProblems: TypirProblem[] = [];
            for (let i = 0; i < value1.length; i++) {
                contentProblems.push(...this.analyzeTypeEqualityProblemsSingle(value1[i], value2[i], failFast));
                if (contentProblems.length >= 1 && failFast) { return contentProblems; }
            }
            return contentProblems;
        } else if (isSet(value1)) {
            assertTrue(isSet(value2));
            const sizeProblem = checkValueForConflict(value1.size, value2.size, 'size');
            if (sizeProblem.length >= 1) {
                return sizeProblem;
            }
            const contentProblems: TypirProblem[] = [];
            for (const v1 of value1.entries()) {
                let found = false;
                for (const v2 of value2.entries()) {
                    if (this.analyzeTypeEqualityProblemsSingle(v1, v2, failFast).length === 0) {
                        found = true;
                        break;
                    }
                }
                if (found === false) {
                    contentProblems.push(<ValueConflict>{
                        $problem: ValueConflict,
                        firstValue: String(v1),
                        secondValue: undefined,
                        location: 'set entries',
                        subProblems: [],
                    });
                    if (contentProblems.length >= 1 && failFast) { return contentProblems; }
                }
            }
            return contentProblems;
        } else if (isMap(value1)) {
            assertTrue(isMap(value2));
            const sizeProblem = checkValueForConflict(value1.size, value2.size, 'size');
            if (sizeProblem.length >= 1) {
                return sizeProblem;
            }
            const contentProblems: TypirProblem[] = [];
            for (const [key, v1] of value1.entries()) {
                const v2 = value2.get(key);
                contentProblems.push(...this.analyzeTypeEqualityProblemsSingle(v1, v2, failFast));
                if (contentProblems.length >= 1 && failFast) { return contentProblems; }
            }
            return contentProblems;
        }
        // primitives
        else if (typeof value1 === 'string' || typeof value1 === 'number' || typeof value1 === 'boolean' || typeof value1 === 'bigint' || typeof value1 === 'symbol') {
            return checkValueForConflict(value1, value2, 'value');
        }
        // composite with recursive object / index signature
        else if (typeof value1 === 'object' && value1 !== null) {
            return this.analyzeTypeEqualityProblemsAll(value1 as CustomTypeStorage<Properties, Specifics>, value2 as CustomTypeStorage<Properties, Specifics>, failFast);
        } else {
            throw new Error(`missing implementation for '${String(value1)}' and '${String(value2)}'.`);
        }
    }
}

export function isCustomType<Properties extends CustomTypeProperties, Specifics extends TypirSpecifics>(type: unknown, kind: string | CustomKind<Properties, Specifics>): type is CustomType<Properties, Specifics> {
    return type instanceof CustomType && (typeof kind === 'string' ? type.kind.options.name === kind : type.kind === kind);
}
