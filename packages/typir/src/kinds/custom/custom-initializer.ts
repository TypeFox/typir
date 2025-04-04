/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type, TypeStateListener } from '../../graph/type-node.js';
import { TypeInitializer } from '../../initialization/type-initializer.js';
import { bindInferCurrentTypeRule, bindValidateCurrentTypeRule, InferenceRuleWithOptions, optionsBoundToType, ValidationRuleWithOptions } from '../../utils/utils-definitions.js';
import { assertTrue, assertTypirType } from '../../utils/utils.js';
import { CustomTypeProperties } from './custom-definitions.js';
import { CreateCustomTypeDetails, CustomKind } from './custom-kind.js';
import { CustomType, isCustomType } from './custom-type.js';

export class CustomTypeInitializer<Properties extends CustomTypeProperties, LanguageType> extends TypeInitializer<CustomType<Properties, LanguageType>, LanguageType> implements TypeStateListener {
    protected readonly typeDetails: CreateCustomTypeDetails<Properties, LanguageType>;
    protected initialCustomType: CustomType<Properties, LanguageType>;

    protected inferenceRules: Array<InferenceRuleWithOptions<LanguageType>> = [];
    protected validationRules: Array<ValidationRuleWithOptions<LanguageType>> = [];

    constructor(kind: CustomKind<Properties, LanguageType>, typeDetails: CreateCustomTypeDetails<Properties, LanguageType>) {
        super(kind.services);
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
            customType.removeListener(this);
            this.deregisterRules(undefined);
            this.createRules(readyCustomType);
            this.registerRules(readyCustomType);
        } else {
            this.deregisterRules(undefined);
            this.registerRules(readyCustomType);
        }
    }

    onSwitchedToCompleted(_customType: Type): void {
        this.initialCustomType.removeListener(this);
    }

    onSwitchedToInvalid(_customType: Type): void {
        // nothing special required here
    }

    protected createRules(customType: CustomType<Properties, LanguageType>): void {
        // clear the current list ...
        this.inferenceRules.splice(0, this.inferenceRules.length);
        this.validationRules.splice(0, this.validationRules.length);

        // ... and recreate all rules
        for (const inferenceRulesForClassLiterals of this.typeDetails.inferenceRules) {
            this.inferenceRules.push(bindInferCurrentTypeRule(inferenceRulesForClassLiterals, customType));
            const validate = bindValidateCurrentTypeRule(inferenceRulesForClassLiterals, customType);
            if (validate) {
                this.validationRules.push(validate);
            }
        }
    }

    // TODO dieses Design für Class and Functions genau so umsetzen/angleichen

    protected registerRules(customType: CustomType<Properties, LanguageType> | undefined): void {
        this.inferenceRules.forEach(rule => this.services.Inference.addInferenceRule(rule.rule, optionsBoundToType(rule.options, customType)));
        this.validationRules.forEach(rule => this.services.validation.Collector.addValidationRule(rule.rule, optionsBoundToType(rule.options, customType)));
    }

    protected deregisterRules(customType: CustomType<Properties, LanguageType> | undefined): void {
        this.inferenceRules.forEach(rule => this.services.Inference.removeInferenceRule(rule.rule, optionsBoundToType(rule.options, customType)));
        this.validationRules.forEach(rule => this.services.validation.Collector.removeValidationRule(rule.rule, optionsBoundToType(rule.options, customType)));
    }

}
