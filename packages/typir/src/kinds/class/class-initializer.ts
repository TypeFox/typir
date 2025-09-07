/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { isType, Type, TypeStateListener } from '../../graph/type-node.js';
import { TypeInitializer } from '../../initialization/type-initializer.js';
import { InferenceProblem, InferenceRuleNotApplicable, TypeInferenceRule } from '../../services/inference.js';
import { TypirServices, TypirSpecifics } from '../../typir.js';
import { bindInferCurrentTypeRule, bindValidateCurrentTypeRule, InferenceRuleWithOptions, optionsBoundToType, skipInferenceRuleForExistingType, ValidationRuleWithOptions } from '../../utils/utils-definitions.js';
import { areTypesEqualUtility, checkNameTypesMap, createTypeCheckStrategy, MapListConverter } from '../../utils/utils-type-comparison.js';
import { assertTypirType, toArray } from '../../utils/utils.js';
import { ClassKind, CreateClassTypeDetails, InferClassLiteral } from './class-kind.js';
import { ClassType, isClassType } from './class-type.js';

export class ClassTypeInitializer<Specifics extends TypirSpecifics> extends TypeInitializer<ClassType, Specifics> implements TypeStateListener {
    protected readonly typeDetails: CreateClassTypeDetails<Specifics>;
    protected readonly kind: ClassKind<Specifics>;
    protected readonly initialClassType: ClassType;

    protected inferenceRules: Array<InferenceRuleWithOptions<Specifics>> = [];
    protected validationRules: Array<ValidationRuleWithOptions<Specifics>> = [];

    constructor(services: TypirServices<Specifics>, kind: ClassKind<Specifics>, typeDetails: CreateClassTypeDetails<Specifics>) {
        super(services);
        this.typeDetails = typeDetails;
        this.kind = kind;

        // create the class type
        this.initialClassType = new ClassType(kind as unknown as ClassKind<TypirSpecifics>, typeDetails as unknown as CreateClassTypeDetails<TypirSpecifics>);
        if (kind.options.typing === 'Structural') {
            // register structural classes also by their names, since these names are usually used for reference in the DSL/AST!
            this.services.infrastructure.Graph.addNode(this.initialClassType, kind.calculateIdentifierWithClassNameOnly(typeDetails));
        }

        this.createRules(this.typeDetails, this.initialClassType);
        // register all the inference rules already now to enable early type inference for this Class type ('undefined', since its Identifier is still missing)
        this.registerRules(undefined);

        this.initialClassType.addListener(this, true); // trigger directly, if some initialization states are already reached!
    }

    onSwitchedToIdentifiable(classType: Type): void {
        /* Important explanations:
         * - This logic here (and 'producedType(...)') ensures, that the same ClassType is not registered twice in the type graph.
         * - By waiting until the new class has its identifier, 'producedType(...)' is able to check, whether this class type is already existing!
         * - Accordingly, 'classType' and 'readyClassType' might have different values!
         */
        assertTypirType(classType, isClassType);
        const readyClassType = this.producedType(classType);

        // remove/invalidate the duplicated and skipped class type now
        if (readyClassType !== classType) {
            // the class type changed, since the same type was already created earlier and is reused here (this is a special case) => skip the classType!
            classType.removeListener(this); // since this ClassTypeInitializer initialized the invalid type, there is nothing to do anymore here!

            if (this.kind.options.typing === 'Structural') {
                // replace the type in the type graph
                const nameBasedIdentifier = this.kind.calculateIdentifierWithClassNameOnly(this.typeDetails);
                this.services.infrastructure.Graph.removeNode(classType, nameBasedIdentifier);
                this.services.infrastructure.Graph.addNode(readyClassType, nameBasedIdentifier);
            }

            // remove the inference rules for the invalid type
            this.deregisterRules(undefined);
            // but re-create the inference rules for the new type!!
            // This is required, since inference rules for different declarations in the AST might be different, but should infer the same Typir type!
            this.createRules(this.typeDetails, readyClassType);
            // add the new rules
            this.registerRules(readyClassType);
        } else {
            // the class type is unchanged (this is the usual case)

            // keep the existing inference rules, but register it for the unchanged class type
            this.deregisterRules(undefined);
            this.registerRules(readyClassType);
        }

        // find equal classes, due to properties with types which have equal types
        if (this.kind.options.typing === 'Structural') {
            this.services.infrastructure.Graph.getAllRegisteredTypes().filter(isClassType) // TODO make this more performant
                .filter(other => other !== readyClassType && areTypesEqualUtility(readyClassType, other))
                .forEach(other => this.services.Equality.markAsEqual(readyClassType, other));
        } else {
            // for nominally typed classes, only the names of classes are relevant for identify/equality, not the properties and their types
        }
    }

    onSwitchedToCompleted(classType: Type): void {
        // If there is no inference rule for the declaration of a class, such a class is probably a library or builtIn class.
        // Therefore, no validation errors can be shown for the classes and exceptions are thrown instead.
        if (this.typeDetails.inferenceRulesForClassDeclaration === null) {
            // check for cycles in sub-type-relationships of classes
            if ((classType as ClassType).hasSubSuperClassCycles()) {
                throw new Error(`Cycles in super-sub-class-relationships are not allowed: ${classType.getName()}`);
            }
        }

        // the work of this initializer is done now
        classType.removeListener(this);
    }

    onSwitchedToInvalid(_previousClassType: Type): void {
        // nothing specific needs to be done for Classes here, since the base implementation takes already care about all relevant stuff
    }

    override getTypeInitial(): ClassType {
        return this.initialClassType;
    }

    protected createRules(typeDetails: CreateClassTypeDetails<Specifics>, classType: ClassType): void {
        // clear the current list ...
        this.inferenceRules.splice(0, this.inferenceRules.length);
        this.validationRules.splice(0, this.validationRules.length);

        // ... and recreate all rules
        for (const inferenceRuleForClassDeclaration of typeDetails.inferenceRulesForClassDeclaration) {
            if (skipInferenceRuleForExistingType(inferenceRuleForClassDeclaration, this.initialClassType, classType)) {
                continue;
            }
            this.inferenceRules.push(bindInferCurrentTypeRule<ClassType, Specifics>(inferenceRuleForClassDeclaration, classType));
            // TODO check values for fields for structual typing!
            const validationRule = bindValidateCurrentTypeRule<ClassType, Specifics>(inferenceRuleForClassDeclaration, classType);
            if (validationRule) {
                this.validationRules.push(validationRule);
            }
        }
        for (const inferenceRuleForClassLiterals of typeDetails.inferenceRulesForClassLiterals) {
            if (skipInferenceRuleForExistingType(inferenceRuleForClassLiterals, this.initialClassType, classType)) {
                continue;
            }
            this.inferenceRules.push(this.createInferenceRuleForLiteral(inferenceRuleForClassLiterals, classType));
            const validationRule = this.createValidationRuleForLiteral(inferenceRuleForClassLiterals, classType);
            if (validationRule) {
                this.validationRules.push(validationRule);
            }
        }
        for (const inferenceRuleForFieldAccess of typeDetails.inferenceRulesForFieldAccess) {
            if (skipInferenceRuleForExistingType(inferenceRuleForFieldAccess, this.initialClassType, classType)) {
                continue;
            }
            this.inferenceRules.push({
                rule: (languageNode, _typir) => {
                    if (inferenceRuleForFieldAccess.filter !== undefined && inferenceRuleForFieldAccess.filter(languageNode) === false) {
                        return InferenceRuleNotApplicable;
                    }
                    if (inferenceRuleForFieldAccess.matching !== undefined && inferenceRuleForFieldAccess.matching(languageNode, classType) === false) {
                        return InferenceRuleNotApplicable;
                    }
                    const result = inferenceRuleForFieldAccess.field(languageNode);
                    if (result === InferenceRuleNotApplicable) {
                        return InferenceRuleNotApplicable;
                    } else if (typeof result === 'string') {
                        // get the type of the given field name
                        const fieldType = classType.getFields(true).get(result);
                        if (fieldType) {
                            return fieldType;
                        }
                        return <InferenceProblem<Specifics>>{
                            $problem: InferenceProblem,
                            languageNode: languageNode,
                            inferenceCandidate: classType,
                            location: `unknown field '${result}'`,
                            // rule: this, // this does not work with functions ...
                            subProblems: [],
                        };
                    } else {
                        return result; // do the type inference for this language node instead
                    }
                },
                options: {
                    languageKey: inferenceRuleForFieldAccess.languageKey,
                    // boundToType: ... this property will be specified outside of this method
                },
            });
            const validationRules = toArray(inferenceRuleForFieldAccess.validation);
            if (validationRules.length >= 1) {
                this.validationRules.push({
                    rule: (languageNode, accept, typir) => {
                        if (inferenceRuleForFieldAccess.filter !== undefined && inferenceRuleForFieldAccess.filter(languageNode) === false) {
                            return;
                        }
                        if (inferenceRuleForFieldAccess.matching !== undefined && inferenceRuleForFieldAccess.matching(languageNode, classType) === false) {
                            return;
                        }
                        const field = inferenceRuleForFieldAccess.field(languageNode);
                        if (field === InferenceRuleNotApplicable) {
                            return;
                        }
                        const fieldType = typeof field === 'string'
                            ? classType.getFields(true).get(field)
                            : typir.Inference.inferType(field);
                        if (isType(fieldType) === false) {
                            return;
                        }
                        // TODO review: insert 'fieldType' as additional parameter?
                        validationRules.forEach(rule => rule(languageNode, classType, accept, typir));
                    },
                    options: {
                        languageKey: inferenceRuleForFieldAccess.languageKey,
                        // boundToType: ... this property will be specified outside of this method
                    },
                });
            }
        }
    }

    protected createInferenceRuleForLiteral<T extends Specifics['LanguageType']>(rule: InferClassLiteral<Specifics, T>, classType: ClassType): InferenceRuleWithOptions<Specifics, T> {
        const mapListConverter = new MapListConverter();
        const kind = this.kind;
        return {
            rule: {
                inferTypeWithoutChildren(languageNode, _typir) {
                    const result = rule.filter === undefined || rule.filter(languageNode);
                    if (result) {
                        const matching = rule.matching === undefined || rule.matching(languageNode, classType);
                        if (matching) {
                            const inputArguments = rule.inputValuesForFields(languageNode);
                            if (inputArguments.size >= 1) {
                                return mapListConverter.toList(inputArguments);
                            } else {
                                // skip this step for nominally typed classes
                                // TODO this needs to be reworked for structural classes!
                                return classType; // this case occurs only, if the current class has no fields (including fields of super types) or is nominally typed
                            }
                        } else {
                            // the language node is slightly different
                        }
                    } else {
                        // the language node has a completely different purpose
                    }
                    // does not match at all
                    return InferenceRuleNotApplicable;
                },
                inferTypeWithChildrensTypes(languageNode, childrenTypes, typir) {
                    const allExpectedFields = classType.getFields(true);
                    // this class type might match, to be sure, resolve the types of the values for the parameters and continue to step 2
                    const checkedFieldsProblems = checkNameTypesMap(
                        mapListConverter.toMap(childrenTypes),
                        allExpectedFields,
                        createTypeCheckStrategy(kind.options.subtypeFieldChecking, typir),
                        false,
                    );
                    if (checkedFieldsProblems.length >= 1) {
                        // (only) for overloaded functions, the types of the parameters need to be inferred in order to determine an exact match
                        return <InferenceProblem<Specifics>>{
                            $problem: InferenceProblem,
                            languageNode: languageNode,
                            inferenceCandidate: classType,
                            location: 'values for fields',
                            rule: this as unknown as TypeInferenceRule<Specifics>,
                            subProblems: checkedFieldsProblems,
                        };
                    } else {
                        return classType;
                    }
                },
            },
            options: {
                languageKey: rule.languageKey,
                // boundToType: ... this property will be specified outside of this method
            },
        };
    }

    protected createValidationRuleForLiteral<T extends Specifics['LanguageType']>(rule: InferClassLiteral<Specifics, T>, classType: ClassType): ValidationRuleWithOptions<Specifics, T> | undefined {
        const validationRules = toArray(rule.validation);
        if (validationRules.length <= 0) {
            return undefined;
        }
        return {
            rule: (languageNode, accept, typir) => {
                if (rule.filter !== undefined && rule.filter(languageNode) === false) {
                    return;
                }
                if (rule.matching !== undefined && rule.matching(languageNode, classType) === false) {
                    return;
                }
                const inputArguments = rule.inputValuesForFields(languageNode);
                if (inputArguments.size >= 1) {
                    // check the given arguments
                    const allExpectedFields = classType.getFields(true);
                    if (allExpectedFields.size !== inputArguments.size) {
                        return;
                    }
                    const compareFieldTypes = createTypeCheckStrategy(this.kind.options.subtypeFieldChecking, typir);
                    for (const [fieldName, argumentValue] of inputArguments.entries()) {
                        const actualFieldType = typir.Inference.inferType(argumentValue);
                        if (isType(actualFieldType) === false) {
                            return; // inference problem => skip validations
                        }
                        const expectedFieldType = allExpectedFields.get(fieldName);
                        if (expectedFieldType === undefined) {
                            return; // argument for a non-existing parameter
                        }
                        if (compareFieldTypes(actualFieldType, expectedFieldType) !== undefined) {
                            return; // types are different
                        }
                        // everything is fine with this argument
                    }
                } else {
                    // skip this step for nominally typed classes
                    // TODO this needs to be reworked for structural classes!
                }
                validationRules.forEach(rule => rule(languageNode, classType, accept, typir));
            },
            options: {
                languageKey: rule.languageKey,
                // boundToType: ... this property will be specified outside of this method
            },
        };
    }

    protected registerRules(classType: ClassType | undefined): void {
        this.inferenceRules.forEach(rule => this.services.Inference.addInferenceRule(rule.rule, optionsBoundToType(rule.options, classType)));
        this.validationRules.forEach(rule => this.services.validation.Collector.addValidationRule(rule.rule, optionsBoundToType(rule.options, classType)));
    }

    protected deregisterRules(classType: ClassType | undefined): void {
        this.inferenceRules.forEach(rule => this.services.Inference.removeInferenceRule(rule.rule, optionsBoundToType(rule.options, classType)));
        this.validationRules.forEach(rule => this.services.validation.Collector.removeValidationRule(rule.rule, optionsBoundToType(rule.options, classType)));
    }

}
