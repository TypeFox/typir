/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeGraphListener } from '../../graph/type-graph.js';
import { Type, TypeStateListener } from '../../graph/type-node.js';
import { TypeInitializer } from '../../initialization/type-initializer.js';
import { MarkSubTypeOptions } from '../../services/subtype.js';
import { bindInferCurrentTypeRule, bindValidateCurrentTypeRule, InferenceRuleWithOptions, optionsBoundToType, skipInferenceRuleForExistingType, ValidationRuleWithOptions } from '../../utils/utils-definitions.js';
import { assertTrue, assertTypirType } from '../../utils/utils.js';
import { CustomTypeProperties } from './custom-definitions.js';
import { CreateCustomTypeDetails, CustomKind } from './custom-kind.js';
import { CustomType, isCustomType } from './custom-type.js';

export class CustomTypeInitializer<Properties extends CustomTypeProperties, LanguageType>
    extends TypeInitializer<CustomType<Properties, LanguageType>, LanguageType>
    implements TypeStateListener, TypeGraphListener
{
    protected readonly kind: CustomKind<Properties, LanguageType>;
    protected readonly typeDetails: CreateCustomTypeDetails<Properties, LanguageType>;
    protected readonly initialCustomType: CustomType<Properties, LanguageType>;

    protected inferenceRules: Array<InferenceRuleWithOptions<LanguageType>> = [];
    protected validationRules: Array<ValidationRuleWithOptions<LanguageType>> = [];

    constructor(kind: CustomKind<Properties, LanguageType>, typeDetails: CreateCustomTypeDetails<Properties, LanguageType>) {
        super(kind.services);
        this.kind = kind;
        this.typeDetails = typeDetails;

        // create the new Custom type
        this.initialCustomType = new CustomType(kind, typeDetails);

        // inference rules
        this.createRules(this.initialCustomType);
        // register all the inference rules already now to enable early type inference for this Custom type ('undefined', since its Identifier is still missing)
        this.registerRules(undefined);

        this.initialCustomType.addListener(this, true);
    }

    override getTypeInitial(): CustomType<Properties, LanguageType> {
        return this.initialCustomType;
    }

    onSwitchedToIdentifiable(customType: Type): void {
        assertTypirType(customType, type => isCustomType<Properties, LanguageType>(type, this.initialCustomType.kind));
        assertTrue(customType === this.initialCustomType);
        const readyCustomType = this.producedType(customType);
        if (readyCustomType !== customType) {
            // check some additional properties to be unique
            if (readyCustomType.getName() !== customType.getName()) {
                throw new Error(`There is already a custom type '${readyCustomType.getIdentifier()}' with name '${readyCustomType.getName()}', but now the name is '${customType.getName()}'!`);
            }
            if (readyCustomType.getUserRepresentation() !== customType.getUserRepresentation()) {
                throw new Error(`There is already a custom type '${readyCustomType.getIdentifier()}' with user representation '${readyCustomType.getUserRepresentation()}', but now the user representation is '${customType.getUserRepresentation()}'!`);
            }
            customType.removeListener(this);
            this.deregisterRules(undefined);
            this.createRules(readyCustomType);
            this.registerRules(readyCustomType);
        } else {
            this.deregisterRules(undefined);
            this.registerRules(readyCustomType);
        }

        // This logic could be called also after creating the type or after completing it instead.
        // Benefit here: The final type is already produced and its identifier is usable, but it might not yet been completed!
        this.handleEdgeRelationshipsOfNewType();
    }

    onSwitchedToCompleted(_customType: Type): void {
        this.initialCustomType.removeListener(this);
        this.services.infrastructure.Graph.removeListener(this);
    }

    onSwitchedToInvalid(_customType: Type): void {
        // nothing special required here
    }

    protected handleEdgeRelationshipsOfNewType(): void {
        // handle relationships of the new custom type to existing and known types
        const newCustomType = this.getTypeFinal() ?? this.getTypeInitial();
        const options = this.kind.options;

        // sub-type
        const subTypeOptions: Partial<MarkSubTypeOptions> = { checkForCycles: false };
        (options?.getSubTypesOfNewCustomType?.call(options.getSubTypesOfNewCustomType, newCustomType) ?? [])
            .forEach(subType => this.services.Subtype.markAsSubType(subType, newCustomType, subTypeOptions));
        (options?.getSuperTypesOfNewCustomType?.call(options.getSuperTypesOfNewCustomType, newCustomType) ?? [])
            .forEach(superType => this.services.Subtype.markAsSubType(newCustomType, superType, subTypeOptions));

        // conversion
        (options?.getNewCustomTypeImplicitlyConvertibleToTypes?.call(options.getNewCustomTypeImplicitlyConvertibleToTypes, newCustomType) ?? [])
            .forEach(to => this.services.Conversion.markAsConvertible(newCustomType, to, 'IMPLICIT_EXPLICIT'));
        (options?.getNewCustomTypeExplicitlyConvertibleToTypes?.call(options.getNewCustomTypeExplicitlyConvertibleToTypes, newCustomType) ?? [])
            .forEach(to => this.services.Conversion.markAsConvertible(newCustomType, to, 'EXPLICIT'));
        (options?.getTypesImplicitlyConvertibleToNewCustomType?.call(options.getTypesImplicitlyConvertibleToNewCustomType, newCustomType) ?? [])
            .forEach(from => this.services.Conversion.markAsConvertible(from, newCustomType, 'IMPLICIT_EXPLICIT'));
        (options?.getTypesExplicitlyConvertibleToNewCustomType?.call(options.getTypesExplicitlyConvertibleToNewCustomType, newCustomType) ?? [])
            .forEach(from => this.services.Conversion.markAsConvertible(from, newCustomType, 'EXPLICIT'));

        // handle relationships of the new custom type to types which are not known in advance
        if (options.isNewCustomTypeSubTypeOf || options.isNewCustomTypeSuperTypeOf ||
            options.isNewCustomTypeConvertibleToType || options.isTypeConvertibleToNewCustomType
        ) {
            this.services.infrastructure.Graph.addListener(this, { callOnAddedForAllExisting: true });
        }
    }

    onAddedType(newOtherType: Type, _key: string): void {
        const newCustomType = this.getTypeFinal() ?? this.getTypeInitial();
        if (newOtherType !== newCustomType) { // don't relate the new custom type to itself
            const options = this.kind.options;

            // sub-type
            if (options.isNewCustomTypeSubTypeOf?.call(options.isNewCustomTypeSubTypeOf, newCustomType, newOtherType)) {
                this.services.Subtype.markAsSubType(newCustomType, newOtherType, { checkForCycles: false });
            }
            if (options.isNewCustomTypeSuperTypeOf?.call(options.isNewCustomTypeSuperTypeOf, newOtherType, newCustomType)) {
                this.services.Subtype.markAsSubType(newOtherType, newCustomType, { checkForCycles: false });
            }

            // conversion
            const convertCustomToOther = options.isNewCustomTypeConvertibleToType?.call(options.isNewCustomTypeConvertibleToType, newCustomType, newOtherType) ?? 'NONE';
            if (convertCustomToOther === 'IMPLICIT_EXPLICIT' || convertCustomToOther === 'EXPLICIT') {
                this.services.Conversion.markAsConvertible(newCustomType, newOtherType, convertCustomToOther);
            }
            const convertOtherToCustom = options.isTypeConvertibleToNewCustomType?.call(options.isTypeConvertibleToNewCustomType, newOtherType, newCustomType) ?? 'NONE';
            if (convertOtherToCustom === 'IMPLICIT_EXPLICIT' || convertOtherToCustom === 'EXPLICIT') {
                this.services.Conversion.markAsConvertible(newOtherType, newCustomType, convertOtherToCustom);
            }
        }
    }

    protected createRules(customType: CustomType<Properties, LanguageType>): void {
        // clear the current list ...
        this.inferenceRules.splice(0, this.inferenceRules.length);
        this.validationRules.splice(0, this.validationRules.length);

        // ... and recreate all rules
        for (const inferenceRule of this.typeDetails.inferenceRules) {
            if (skipInferenceRuleForExistingType(inferenceRule, this.initialCustomType, customType)) { // this means: the 'initialCustomType' is the newly created type, the 'customType' is the already existing type
                // don't create (additional) rules for the already existing type
                continue;
            }
            this.inferenceRules.push(bindInferCurrentTypeRule(inferenceRule, customType));
            const validate = bindValidateCurrentTypeRule(inferenceRule, customType);
            if (validate) {
                this.validationRules.push(validate);
            }
        }
    }

    protected registerRules(customType: CustomType<Properties, LanguageType> | undefined): void {
        this.inferenceRules.forEach(rule => this.services.Inference.addInferenceRule(rule.rule, optionsBoundToType(rule.options, customType)));
        this.validationRules.forEach(rule => this.services.validation.Collector.addValidationRule(rule.rule, optionsBoundToType(rule.options, customType)));
    }

    protected deregisterRules(customType: CustomType<Properties, LanguageType> | undefined): void {
        this.inferenceRules.forEach(rule => this.services.Inference.removeInferenceRule(rule.rule, optionsBoundToType(rule.options, customType)));
        this.validationRules.forEach(rule => this.services.validation.Collector.removeValidationRule(rule.rule, optionsBoundToType(rule.options, customType)));
    }

}
