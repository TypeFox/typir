/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeInferenceRule, InferenceRuleNotApplicable, InferenceProblem } from '../../services/inference.js';
import { TypeStateListener, Type } from '../../graph/type-node.js';
import { TypeInitializer } from '../../initialization/type-initializer.js';
import { TypirServices } from '../../typir.js';
import { MapListConverter, checkNameTypesMap, createTypeCheckStrategy } from '../../utils/utils-type-comparison.js';
import { assertType } from '../../utils/utils.js';
import { CreateClassTypeDetails, ClassKind, InferClassLiteral } from './class-kind.js';
import { ClassType, isClassType } from './class-type.js';

export class ClassTypeInitializer<T = unknown, T1 = unknown, T2 = unknown> extends TypeInitializer<ClassType> implements TypeStateListener {
    protected readonly typeDetails: CreateClassTypeDetails<T, T1, T2>;
    protected readonly kind: ClassKind;
    protected inferenceRules: TypeInferenceRule[];
    protected initialClassType: ClassType;

    constructor(services: TypirServices, kind: ClassKind, typeDetails: CreateClassTypeDetails<T, T1, T2>) {
        super(services);
        this.typeDetails = typeDetails;
        this.kind = kind;

        // create the class type
        this.initialClassType = new ClassType(kind, typeDetails as CreateClassTypeDetails);
        if (kind.options.typing === 'Structural') {
            // register structural classes also by their names, since these names are usually used for reference in the DSL/AST!
            this.services.infrastructure.Graph.addNode(this.initialClassType, kind.calculateIdentifierWithClassNameOnly(typeDetails));
        }

        this.inferenceRules = this.createInferenceRules<T, T1, T2>(this.typeDetails, this.initialClassType);
        // register all the inference rules already now to enable early type inference for this Class type
        this.inferenceRules.forEach(rule => services.Inference.addInferenceRule(rule, undefined)); // 'undefined', since the Identifier is still missing

        this.initialClassType.addListener(this, true); // trigger directly, if some initialization states are already reached!
    }

    switchedToIdentifiable(classType: Type): void {
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
            this.inferenceRules.forEach(rule => this.services.Inference.removeInferenceRule(rule, undefined));
            // but re-create the inference rules for the new type!!
            // This is required, since inference rules for different declarations in the AST might be different, but should infer the same Typir type!
            this.inferenceRules = this.createInferenceRules(this.typeDetails, readyClassType);
            this.inferenceRules.forEach(rule => this.services.Inference.addInferenceRule(rule, readyClassType));
        } else {
            // the class type is unchanged (this is the usual case)

            // keep the existing inference rules, but register it for the unchanged class type
            this.inferenceRules.forEach(rule => this.services.Inference.removeInferenceRule(rule, undefined));
            this.inferenceRules.forEach(rule => this.services.Inference.addInferenceRule(rule, readyClassType));
        }
    }

    switchedToCompleted(classType: Type): void {
        // If there is no inference rule for the declaration of a class, such a class is probably a library or builtIn class.
        // Therefore, no validation errors can be shown for the classes and exceptions are thrown instead.
        if (this.typeDetails.inferenceRuleForDeclaration === null) {
            // check for cycles in sub-type-relationships of classes
            if ((classType as ClassType).hasSubSuperClassCycles()) {
                throw new Error(`Cycles in super-sub-class-relationships are not allowed: ${classType.getName()}`);
            }
        }

        // the work of this initializer is done now
        classType.removeListener(this);
    }

    switchedToInvalid(_previousClassType: Type): void {
        // nothing specific needs to be done for Classes here, since the base implementation takes already care about all relevant stuff
    }

    override getTypeInitial(): ClassType {
        return this.initialClassType;
    }

    protected createInferenceRules<T, T1, T2>(typeDetails: CreateClassTypeDetails<T, T1, T2>, classType: ClassType): TypeInferenceRule[] {
        const result: TypeInferenceRule[] = [];
        if (typeDetails.inferenceRuleForDeclaration) {
            result.push({
                inferTypeWithoutChildren(domainElement, _typir) {
                    if (typeDetails.inferenceRuleForDeclaration!(domainElement)) {
                        return classType;
                    } else {
                        return InferenceRuleNotApplicable;
                    }
                },
                inferTypeWithChildrensTypes(_domainElement, _childrenTypes, _typir) {
                    // TODO check values for fields for structual typing!
                    return classType;
                },
            });
        }
        if (typeDetails.inferenceRuleForConstructor) {
            result.push(this.createInferenceRuleForLiteral(typeDetails.inferenceRuleForConstructor, classType));
        }
        if (typeDetails.inferenceRuleForReference) {
            result.push(this.createInferenceRuleForLiteral(typeDetails.inferenceRuleForReference, classType));
        }
        if (typeDetails.inferenceRuleForFieldAccess) {
            result.push((domainElement, _typir) => {
                const result = typeDetails.inferenceRuleForFieldAccess!(domainElement);
                if (result === InferenceRuleNotApplicable) {
                    return InferenceRuleNotApplicable;
                } else if (typeof result === 'string') {
                    // get the type of the given field name
                    const fieldType = classType.getFields(true).get(result);
                    if (fieldType) {
                        return fieldType;
                    }
                    return <InferenceProblem>{
                        $problem: InferenceProblem,
                        domainElement,
                        inferenceCandidate: classType,
                        location: `unknown field '${result}'`,
                        // rule: this, // this does not work with functions ...
                        subProblems: [],
                    };
                } else {
                    return result; // do the type inference for this element instead
                }
            });
        }
        return result;
    }

    protected createInferenceRuleForLiteral<T>(rule: InferClassLiteral<T>, classType: ClassType): TypeInferenceRule {
        const mapListConverter = new MapListConverter();
        const kind = this.kind;
        return {
            inferTypeWithoutChildren(domainElement, _typir) {
                const result = rule.filter(domainElement);
                if (result) {
                    const matching = rule.matching(domainElement);
                    if (matching) {
                        const inputArguments = rule.inputValuesForFields(domainElement);
                        if (inputArguments.size >= 1) {
                            return mapListConverter.toList(inputArguments);
                        } else {
                            // there are no operands to check
                            return classType; // this case occurs only, if the current class has no fields (including fields of super types) or is nominally typed
                        }
                    } else {
                        // the domain element is slightly different
                    }
                } else {
                    // the domain element has a completely different purpose
                }
                // does not match at all
                return InferenceRuleNotApplicable;
            },
            inferTypeWithChildrensTypes(domainElement, childrenTypes, typir) {
                const allExpectedFields = classType.getFields(true);
                // this class type might match, to be sure, resolve the types of the values for the parameters and continue to step 2
                const checkedFieldsProblems = checkNameTypesMap(
                    mapListConverter.toMap(childrenTypes),
                    allExpectedFields,
                    createTypeCheckStrategy(kind.options.subtypeFieldChecking, typir)
                );
                if (checkedFieldsProblems.length >= 1) {
                    // (only) for overloaded functions, the types of the parameters need to be inferred in order to determine an exact match
                    return <InferenceProblem>{
                        $problem: InferenceProblem,
                        domainElement,
                        inferenceCandidate: classType,
                        location: 'values for fields',
                        rule: this,
                        subProblems: checkedFieldsProblems,
                    };
                } else {
                    // the current function is not overloaded, therefore, the types of their parameters are not required => save time, ignore inference errors
                    return classType;
                }
            },
        };
    }

}
