/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type, TypeStateListener } from '../../graph/type-node.js';
import { TypeInitializer } from '../../initialization/type-initializer.js';
import { InferenceProblem, InferenceRuleNotApplicable, TypeInferenceRule } from '../../services/inference.js';
import { TypirServices } from '../../typir.js';
import { InferenceRuleWithOptions, optionsBoundToType, bindInferCurrentTypeRule, ValidationRuleWithOptions, bindValidateCurrentTypeRule } from '../../utils/utils-definitions.js';
import { MapListConverter, checkNameTypesMap, createTypeCheckStrategy } from '../../utils/utils-type-comparison.js';
import { assertType } from '../../utils/utils.js';
import { ClassKind, CreateClassTypeDetails, InferClassLiteral } from './class-kind.js';
import { ClassType, isClassType } from './class-type.js';

export class ClassTypeInitializer<LanguageType = unknown> extends TypeInitializer<ClassType, LanguageType> implements TypeStateListener {
    protected readonly typeDetails: CreateClassTypeDetails<LanguageType>;
    protected readonly kind: ClassKind<LanguageType>;
    protected inferenceRules: Array<InferenceRuleWithOptions<LanguageType>> = [];
    protected validationRules: Array<ValidationRuleWithOptions<LanguageType>> = [];
    protected initialClassType: ClassType;

    constructor(services: TypirServices<LanguageType>, kind: ClassKind<LanguageType>, typeDetails: CreateClassTypeDetails<LanguageType>) {
        super(services);
        this.typeDetails = typeDetails;
        this.kind = kind;

        // create the class type
        this.initialClassType = new ClassType(kind as ClassKind, typeDetails as CreateClassTypeDetails);
        if (kind.options.typing === 'Structural') {
            // register structural classes also by their names, since these names are usually used for reference in the DSL/AST!
            this.services.infrastructure.Graph.addNode(this.initialClassType, kind.calculateIdentifierWithClassNameOnly(typeDetails));
        }

        this.createInferenceAndValidationRules(this.typeDetails, this.initialClassType);
        // register all the inference rules already now to enable early type inference for this Class type
        this.inferenceRules.forEach(rule => services.Inference.addInferenceRule(rule.rule, optionsBoundToType(rule.options, undefined))); // 'undefined', since the Identifier is still missing

        this.initialClassType.addListener(this, true); // trigger directly, if some initialization states are already reached!
    }

    onSwitchedToIdentifiable(classType: Type): void {
        /* Important explanations:
         * - This logic here (and 'producedType(...)') ensures, that the same ClassType is not registered twice in the type graph.
         * - By waiting untile the new class has its identifier, 'producedType(...)' is able to check, whether this class type is already existing!
         * - Accordingly, 'classType' and 'readyClassType' might have different values!
         */
        assertType(classType, isClassType);
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
            this.inferenceRules.forEach(rule => this.services.Inference.removeInferenceRule(rule.rule, optionsBoundToType(rule.options, undefined)));
            // but re-create the inference rules for the new type!!
            // This is required, since inference rules for different declarations in the AST might be different, but should infer the same Typir type!
            this.createInferenceAndValidationRules(this.typeDetails, readyClassType);
            this.inferenceRules.forEach(rule => this.services.Inference.addInferenceRule(rule.rule, optionsBoundToType(rule.options, readyClassType)));
        } else {
            // the class type is unchanged (this is the usual case)

            // keep the existing inference rules, but register it for the unchanged class type
            this.inferenceRules.forEach(rule => this.services.Inference.removeInferenceRule(rule.rule, optionsBoundToType(rule.options, undefined)));
            this.inferenceRules.forEach(rule => this.services.Inference.addInferenceRule(rule.rule, optionsBoundToType(rule.options, readyClassType)));
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

    protected createInferenceAndValidationRules(typeDetails: CreateClassTypeDetails<LanguageType>, classType: ClassType): void {
        // clear the current list ...
        this.inferenceRules.splice(0, this.inferenceRules.length);
        this.validationRules.splice(0, this.validationRules.length);

        // ... and recreate all rules
        for (const inferenceRulesForClassDeclaration of typeDetails.inferenceRulesForClassDeclaration) {
            this.inferenceRules.push(bindInferCurrentTypeRule<ClassType, LanguageType>(inferenceRulesForClassDeclaration, classType));
            // TODO check values for fields for structual typing!
            const validationRule = bindValidateCurrentTypeRule<ClassType, LanguageType>(inferenceRulesForClassDeclaration, classType);
            if (validationRule) {
                this.validationRules.push(validationRule);
            }
        }
        for (const inferenceRulesForClassLiterals of typeDetails.inferenceRulesForClassLiterals) {
            this.inferenceRules.push(this.createInferenceRuleForLiteral(inferenceRulesForClassLiterals, classType));
            // TODO validation
        }
        for (const inferenceRulesForFieldAccess of typeDetails.inferenceRulesForFieldAccess) {
            this.inferenceRules.push({
                rule: (languageNode, _typir) => {
                    const result = inferenceRulesForFieldAccess.field(languageNode);
                    if (result === InferenceRuleNotApplicable) {
                        return InferenceRuleNotApplicable;
                    } else if (typeof result === 'string') {
                        // get the type of the given field name
                        const fieldType = classType.getFields(true).get(result);
                        if (fieldType) {
                            return fieldType;
                        }
                        return <InferenceProblem<LanguageType>>{
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
                    languageKey: inferenceRulesForFieldAccess.languageKey,
                    // boundToType: ... this property will be specified outside of this method
                },
            });
            // TODO validation
        }
    }

    protected createInferenceRuleForLiteral<T extends LanguageType>(rule: InferClassLiteral<LanguageType, T>, classType: ClassType): InferenceRuleWithOptions<LanguageType, T> {
        const mapListConverter = new MapListConverter();
        const kind = this.kind;
        return {
            rule: {
                inferTypeWithoutChildren(languageNode, _typir) {
                    const result = rule.filter === undefined || rule.filter(languageNode);
                    if (result) {
                        const matching = rule.matching === undefined || rule.matching(languageNode);
                        if (matching) {
                            const inputArguments = rule.inputValuesForFields(languageNode);
                            if (inputArguments.size >= 1) {
                                return mapListConverter.toList(inputArguments);
                            } else {
                                // there are no operands to check
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
                        createTypeCheckStrategy(kind.options.subtypeFieldChecking, typir)
                    );
                    if (checkedFieldsProblems.length >= 1) {
                        // (only) for overloaded functions, the types of the parameters need to be inferred in order to determine an exact match
                        return <InferenceProblem<LanguageType>>{
                            $problem: InferenceProblem,
                            languageNode: languageNode,
                            inferenceCandidate: classType,
                            location: 'values for fields',
                            rule: this as unknown as TypeInferenceRule<LanguageType>,
                            subProblems: checkedFieldsProblems,
                        };
                    } else {
                        // the current function is not overloaded, therefore, the types of their parameters are not required => save time, ignore inference errors
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

}
