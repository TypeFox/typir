/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { CompositeTypeInferenceRule } from '../features/inference.js';
import { SubTypeProblem } from '../features/subtype.js';
import { DefaultValidationCollector, ValidationCollector, ValidationProblem } from '../features/validation.js';
import { TypeEdge } from '../graph/type-edge.js';
import { Type, isType } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { TypirProblem, compareNameTypePair, compareNameTypePairs, compareTypes, compareValueForConflict } from '../utils/utils-type-comparison.js';
import { NameTypePair } from '../utils/utils.js';
import { Kind, isKind } from './kind.js';

export interface FunctionKindOptions {
    // these three options controls structural vs nominal typing somehow ...
    enforceFunctionName: boolean,
    enforceInputParameterNames: boolean,
    enforceOutputParameterName: boolean,
    /** Will be used only internally as prefix for the unique identifiers for function type names. */
    identifierPrefix: string,
    // TODO type to return, if a function has no output type
}

export const FunctionKindName = 'FunctionKind';

export interface FunctionTypeDetails<T> {
    functionName: string,
    /** The order of parameters is important! */
    outputParameter: NameTypePair | undefined,
    inputParameters: NameTypePair[],
    /** for function declarations => returns the funtion type (the whole signature including all names) */
    inferenceRuleForDeclaration?: (domainElement: unknown) => boolean,
    /** for function calls => returns the return type of the function */
    inferenceRuleForCalls?: InferFunctionCall<T>,
    // TODO for function references (like the declaration, but without any names!) => returns signature (without any names)
}

/** Collects all functions with the same name */
interface OverloadedFunctionDetails {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    overloadedFunctions: Array<SingleFunctionDetails<any>>;
    inference: CompositeTypeInferenceRule; // collects the inference rules for all functions with the same name
    sameOutputType: Type | undefined; // if all overloaded functions with the same name have the same output/return type, this type is remembered here
}

interface SingleFunctionDetails<T> {
    functionType: Type;
    inferenceRuleForCalls?: InferFunctionCall<T>;
}

// (domainElement: unknown) => boolean | unknown[]
export type InferFunctionCall<T = unknown> = {
    filter: (domainElement: unknown) => domainElement is T;
    matching: (domainElement: T) => boolean;
    inputArguments: (domainElement: T) => unknown[];
};

/**
 * Architecture of Inference rules:
 * - flag for overload / checking parameter types => no, that is bad usability, e.g. operators use already overloaded functions!
 * - overloaded functions are specific for the function kind => solve it inside the FunctionKind!
 *
 * How many inference rules?
 * - One inference rule for each function type does not work, since TODO ??
 * - Checking multiple functions within the same rule (e.g. only one inference rule for the function kind or one inference rule for each function name) does not work,
 *   since multiple different sets of parameters must be returned for overloaded functions!
 * - multiple IR collectors: how to apply all the other rules?!
 *
 * How many validation rules?
 * - For validation, it is enough that at least one of the function variants match!
 * - But checking that is not possible with multiple independent rules.
 * - Therefore, it must be a single validation for each function name (with all type variants).
 * - In order to simplify (de)registering validation rules, only one validation rule for all functions is used here (with an internal loop over all function names).
 *
 * How to know the available (overloaded) functions?
 * - search in all Types VS remember them in a Map; add VS remove function type
 */


/**
 * Represents signatures of executable code.
 *
 * TODO possible Extensions:
 * - multiple output parameters
 * - create variants of this, e.g. functions, procedures, lambdas
 * - (structural vs nominal typing? somehow realized by the three options above ...)
 * - optional parameters
 */
export class FunctionKind implements Kind {
    readonly $name: 'FunctionKind';
    readonly typir: Typir;
    readonly options: FunctionKindOptions;
    /** TODO Limitations
     * - Works only, if function types are defined using the createFunctionType(...) function below!
     * - How to remove function types later? How to observe this case/event? How to remove their inference rules and validations?
     * - Improve the type graph with fast access to all types of a dedicated kind?
     */
    protected readonly mapNameTypes: Map<string, OverloadedFunctionDetails> = new Map(); // function name => all overloaded functions with this name/key

    constructor(typir: Typir, options?: Partial<FunctionKindOptions>) {
        this.$name = 'FunctionKind';
        this.typir = typir;
        this.typir.registerKind(this);
        this.options = {
            // the default values:
            enforceFunctionName: false,
            enforceInputParameterNames: false,
            enforceOutputParameterName: false,
            identifierPrefix: 'function',
            // the actually overriden values:
            ...options
        };

        // register Validations for input arguments (must be done here to support overloaded functions)
        this.typir.validation.collector.addValidationRules(
            (domainElement, _typir) => {
                const resultAll: ValidationProblem[] = [];
                for (const [overloadedName, overloadedFunctions] of this.mapNameTypes.entries()) {
                    const resultOverloaded: ValidationProblem[] = [];
                    const isOverloaded = overloadedFunctions.overloadedFunctions.length >= 2;
                    for (const singleFunction of overloadedFunctions.overloadedFunctions) {
                        if (singleFunction.inferenceRuleForCalls === undefined) {
                            continue;
                        }
                        const filter = singleFunction.inferenceRuleForCalls.filter(domainElement);
                        if (filter) {
                            const matching = singleFunction.inferenceRuleForCalls.matching(domainElement);
                            if (matching) {
                                const inputArguments = singleFunction.inferenceRuleForCalls.inputArguments(domainElement);
                                if (inputArguments && inputArguments.length >= 1) {
                                    // partial match:
                                    const expectedParameterTypes = this.getInputs(singleFunction.functionType);
                                    // check, that the given number of parameters is the same as the expected number of input parameters
                                    const currentProblems: ValidationProblem[] = [];
                                    // TODO use existing helper functions for that? that are no "ValidationProblem"s, but IndexedTypeConflicts, AssignabilityProblems?
                                    const parameterLength = compareValueForConflict(expectedParameterTypes.length, inputArguments.length, 'number of input parameter values');
                                    if (parameterLength.length >= 1) {
                                        currentProblems.push({
                                            domainElement,
                                            severity: 'error',
                                            message: 'The number of given parameter values does not match the expected number of input parameters.',
                                            subProblems: parameterLength
                                        });
                                    } else {
                                        // there are parameter values to check their types
                                        const inferredParameterTypes = inputArguments.map(p => typir.inference.inferType(p));
                                        for (let i = 0; i < inputArguments.length; i++) {
                                            const expectedType = expectedParameterTypes[i];
                                            const inferredType = inferredParameterTypes[i];
                                            if (isType(inferredType)) {
                                                const parameterComparison = typir.assignability.isAssignable(inferredType, expectedType.type);
                                                if (parameterComparison !== true) {
                                                    // the value is not assignable to the type of the input parameter
                                                    currentProblems.push({
                                                        domainElement: inputArguments[i],
                                                        severity: 'error',
                                                        message: `The parameter '${expectedType.name}' at index ${i} got a value with a wrong type.`,
                                                        subProblems: [parameterComparison],
                                                    });
                                                } else {
                                                    // this parameter value is fine
                                                }
                                            } else {
                                                // the type of the value for the input parameter is not inferrable
                                                currentProblems.push({
                                                    // Note that the node of the current parameter is chosen here, while the problem is a sub-problem of the whole function!
                                                    domainElement: inputArguments[i],
                                                    severity: 'error',
                                                    message: `The parameter '${expectedType.name}' at index ${i} has no inferred type.`,
                                                    subProblems: inferredType,
                                                });
                                            }
                                        }
                                    }
                                    // summarize all parameters of the current function
                                    if (currentProblems.length >= 1) {
                                        // some problems with parameters => this signature does not match
                                        resultOverloaded.push({
                                            domainElement,
                                            severity: 'error',
                                            message: `The given operands for the function '${this.typir.printer.printType(singleFunction.functionType)}' match the expected types only partially.`,
                                            subProblems: currentProblems,
                                        });
                                    } else {
                                        return []; // 100% match found! (same case as above)
                                    }
                                } else {
                                    // complete match found => no hurt constraint here => no error to show
                                    // since this signature matches 100%, there is no need to check the other function signatures anymore!
                                    return [];
                                }
                            } else {
                                // false => does slightly not match => no constraints apply here => no error to show here
                            }
                        } else {
                            // false => does not match at all => no constraints apply here => no error to show here
                        }
                    }
                    if (resultOverloaded.length >= 1) {
                        if (isOverloaded) {
                            resultAll.push({
                                domainElement,
                                severity: 'error',
                                message: `The given operands for the overloaded function '${overloadedName}' match the expected types only partially.`,
                                subProblems: resultOverloaded,
                            });
                        } else {
                            resultAll.push(...resultOverloaded);
                        }
                    }
                }
                return resultAll;
            }
        );
    }

    getFunctionType<T>(typeDetails: FunctionTypeDetails<T>): Type | undefined {
        const key = this.printFunctionType(typeDetails);
        return this.typir.graph.getType(key);
    }

    getOrCreateFunctionType<T>(typeDetails: FunctionTypeDetails<T>): Type {
        const result = this.getFunctionType(typeDetails);
        if (result) {
            return result;
        }
        return this.createFunctionType(typeDetails);
    }

    createFunctionType<T>(typeDetails: FunctionTypeDetails<T>): Type {
        // create the function type
        if (!typeDetails) {
            throw new Error('is undefined');
        }
        const functionName = typeDetails.functionName;
        this.enforceName(functionName, this.options.enforceFunctionName);
        const uniqueTypeName = this.printFunctionType(typeDetails);
        const functionType = new Type(this, uniqueTypeName);
        functionType.properties.set(SIMPLE_NAME, functionName);
        this.typir.graph.addNode(functionType);

        // output parameter
        if (typeDetails.outputParameter) {
            const edge = new TypeEdge(functionType, typeDetails.outputParameter.type, OUTPUT_PARAMETER);
            this.enforceName(typeDetails.outputParameter.name, this.options.enforceOutputParameterName);
            edge.properties.set(PARAMETER_NAME, typeDetails.outputParameter.name);
            this.typir.graph.addEdge(edge);
        } else {
            // no output parameter => no inference rule for calling this function
            if (typeDetails.inferenceRuleForCalls) {
                throw new Error(`A function '${functionName}' without output parameter cannot have an inferred type, when this function is called!`);
            }
        }

        // input parameters
        typeDetails.inputParameters.forEach((input, index) => {
            const edge = new TypeEdge(functionType, input.type, INPUT_PARAMETER);
            this.enforceName(input.name, this.options.enforceInputParameterNames);
            edge.properties.set(PARAMETER_NAME, input.name);
            edge.properties.set(PARAMETER_ORDER, index);
            this.typir.graph.addEdge(edge);
        });

        // remember the new function for later in order to enable overloaded functions!
        const mapNameTypes = this.mapNameTypes;
        let overloaded = mapNameTypes.get(functionName);
        if (overloaded) {
            // do nothing
        } else {
            overloaded = {
                overloadedFunctions: [],
                inference: new CompositeTypeInferenceRule(),
                sameOutputType: undefined,
            };
            mapNameTypes.set(functionName, overloaded);
            this.typir.inference.addInferenceRule(overloaded.inference);
        }
        if (overloaded.overloadedFunctions.length <= 0) {
            // remember the output type of the first function
            overloaded.sameOutputType = typeDetails.outputParameter?.type;
        } else {
            if (overloaded.sameOutputType && typeDetails.outputParameter?.type && this.typir.equality.areTypesEqual(overloaded.sameOutputType, typeDetails.outputParameter.type)) {
                // the output types of all overloaded functions are the same for now
            } else {
                // there is a difference
                overloaded.sameOutputType = undefined;
            }
        }
        overloaded.overloadedFunctions.push({
            functionType,
            inferenceRuleForCalls: typeDetails.inferenceRuleForCalls,
        });

        if (typeDetails.inferenceRuleForCalls && typeDetails.outputParameter?.type) {
            /** Preconditions:
             * - there is a rule which specifies how to infer the current function type
             * - the current function has an output type/parameter, otherwise, this function could not provide any type, when it is called!
             *   TODO sollte der dann zurückgegebene Type konfigurierbar gemacht werden? e.g. Type|undefined
             */

            // register inference rule for calls of the new function
            overloaded.inference.subRules.push({
                isRuleApplicable(domainElement, _typir) {
                    const result = typeDetails.inferenceRuleForCalls!.filter(domainElement);
                    if (result) {
                        const matching = typeDetails.inferenceRuleForCalls!.matching(domainElement);
                        if (matching) {
                            const inputArguments = typeDetails.inferenceRuleForCalls!.inputArguments(domainElement);
                            if (inputArguments && inputArguments.length >= 1) {
                                // this function type might match, to be sure, resolve the types of the values for the parameters and continue to step 2
                                const overloadInfos = mapNameTypes.get(functionName);
                                if (overloadInfos && overloadInfos.overloadedFunctions.length >= 2) {
                                    // (only) for overloaded functions:
                                    if (overloadInfos.sameOutputType) {
                                        // exception: all(!) overloaded functions have the same(!) output type, save performance and return this type!
                                        return overloadInfos.sameOutputType;
                                    } else {
                                        // otherwise: the types of the parameters need to be inferred in order to determine an exact match
                                        return inputArguments;
                                    }
                                } else {
                                    // the current function is not overloaded, therefore, the types of their parameters are not required => save time, ignore inference errors
                                    return typeDetails.outputParameter!.type;
                                }
                            } else {
                                // there are no operands to check
                                return typeDetails.outputParameter!.type; // this case occurs only, if the current function has an output type/parameter!
                            }
                        } else {
                            // the domain element is slightly different
                        }
                    } else {
                        // the domain element has a completely different purpose
                    }
                    // does not match at all
                    return 'RULE_NOT_APPLICABLE';
                },
                inferType(domainElement, childrenTypes, typir) {
                    const inputTypes = typeDetails.inputParameters.map(p => p.type);
                    // all operands need to be assignable(! not equal) to the required types
                    const comparisonConflicts = compareTypes(childrenTypes, inputTypes,
                        (t1, t2) => typir.assignability.isAssignable(t1, t2));
                    if (comparisonConflicts.length >= 1) {
                        // this function type does not match, due to assignability conflicts => return them as errors
                        return {
                            domainElement,
                            inferenceCandidate: functionType,
                            location: 'input parameters',
                            rule: this,
                            subProblems: comparisonConflicts,
                        };
                        // We have a dedicated validation for this case (see below), but a resulting error might be ignored by the user => return the problem during type-inference again
                    } else {
                        // matching => return the return type of the function for the case of a function call!
                        return typeDetails.outputParameter!.type; // this case occurs only, if the current function has an output type/parameter!
                    }
                },
            });
        }

        // register inference rule for the declaration of the new function
        // (regarding overloaded function, for now, it is assumed, that the given inference rule itself is concrete enough to handle overloaded functions itself!)
        if (typeDetails.inferenceRuleForDeclaration) {
            this.typir.inference.addInferenceRule({
                isRuleApplicable(domainElement, _typir) {
                    if (typeDetails.inferenceRuleForDeclaration!(domainElement)) {
                        return functionType;
                    } else {
                        return 'RULE_NOT_APPLICABLE';
                    }
                },
            });
        }

        return functionType;
    }

    protected createValidationServiceForFunctions(): ValidationCollector {
        return new DefaultValidationCollector(this.typir);
    }

    getUserRepresentation(type: Type): string {
        // check input
        if (isFunctionKind(type.kind) === false) {
            throw new Error();
        }
        // inputs
        const inputs = this.getInputs(type);
        const inputsString = inputs.map(input => this.getUserRepresentationNameTypePair(input)).join(', ');
        // output
        const output = this.getOutput(type);
        const outputString = output
            ? (this.hasName(output.name) ? `(${this.getUserRepresentationNameTypePair(output)})` : this.typir.printer.printType(output.type))
            : undefined;
        // function name
        const simpleFunctionName = this.getSimpleFunctionName(type);
        // complete signature
        if (this.hasName(simpleFunctionName)) {
            const outputValue = outputString ? `: ${outputString}` : '';
            return `${simpleFunctionName}(${inputsString})${outputValue}`;
        } else {
            return `(${inputsString}) => ${outputString ?? '()'}`;
        }
    }

    protected getUserRepresentationNameTypePair(pair: NameTypePair): string {
        const typeName = this.typir.printer.printType(pair.type);
        if (this.hasName(pair.name)) {
            return `${pair.name}: ${typeName}`;
        } else {
            return typeName;
        }
    }

    protected printFunctionType<T>(typeDetails: FunctionTypeDetails<T>): string {
        const prefix = this.options.identifierPrefix;
        // inputs
        const inputsString = typeDetails.inputParameters.map(input => this.printNameTypePair(input)).join(',');
        // output
        const outputString = typeDetails.outputParameter ? this.printNameTypePair(typeDetails.outputParameter) : '';
        // function name
        const functionName = this.hasName(typeDetails.functionName) ? typeDetails.functionName : '';
        // complete signature
        return `${prefix}-${functionName}(${inputsString}):(${outputString})`;
    }

    protected printNameTypePair(pair: NameTypePair): string {
        const typeName = this.typir.printer.printType(pair.type);
        if (this.hasName(pair.name)) {
            return `${pair.name}:${typeName}`;
        } else {
            return typeName;
        }
    }

    protected enforceName(name: string | undefined, enforce: boolean) {
        if (enforce && this.hasName(name) === false) {
            throw new Error('a name is required');
        }
    }
    protected hasName(name: string | undefined): name is string {
        return name !== undefined && name !== FUNCTION_MISSING_NAME;
    }

    isSubType(superType: Type, subType: Type): TypirProblem[] {
        if (isFunctionKind(superType.kind) && isFunctionKind(subType.kind)) {
            const conflicts: TypirProblem[] = [];
            // output: target parameter must be assignable to source parameter
            conflicts.push(...compareNameTypePair(superType.kind.getOutput(superType), subType.kind.getOutput(subType),
                this.options.enforceOutputParameterName, (s, t) => this.typir.assignability.isAssignable(t, s)));
            // input: source parameters must be assignable to target parameters
            conflicts.push(...compareNameTypePairs(superType.kind.getInputs(superType), subType.kind.getInputs(subType),
                this.options.enforceInputParameterNames, (s, t) => this.typir.assignability.isAssignable(s, t)));
            return conflicts;
        }
        return [<SubTypeProblem>{
            superType,
            subType,
            subProblems: compareValueForConflict(superType.kind.$name, subType.kind.$name, 'kind'),
        }];
    }

    areTypesEqual(type1: Type, type2: Type): TypirProblem[] {
        if (isFunctionKind(type1.kind) && isFunctionKind(type2.kind)) {
            const conflicts: TypirProblem[] = [];
            // same name? TODO is this correct??
            if (this.options.enforceFunctionName) {
                conflicts.push(...compareValueForConflict(type1.kind.getSimpleFunctionName(type1), type2.kind.getSimpleFunctionName(type2), 'simple name'));
            }
            // same output?
            conflicts.push(...compareNameTypePair(type1.kind.getOutput(type1), type2.kind.getOutput(type2),
                this.options.enforceOutputParameterName, (s, t) => this.typir.equality.areTypesEqual(s, t)));
            // same input?
            conflicts.push(...compareNameTypePairs(type2.kind.getInputs(type1), type2.kind.getInputs(type2),
                this.options.enforceInputParameterNames, (s, t) => this.typir.equality.areTypesEqual(s, t)));
            return conflicts;
        }
        throw new Error();
    }

    getSimpleFunctionName(functionType: Type): string {
        const name = functionType.properties.get(SIMPLE_NAME);
        if (typeof name === 'string') {
            return name;
        }
        throw new Error();
    }

    getOutput(functionType: Type): NameTypePair | undefined {
        const outs = functionType.getOutgoingEdges(OUTPUT_PARAMETER);
        if (outs.length <= 0) {
            return undefined;
        } else if (outs.length === 1) {
            return { name: outs[0].properties.get(PARAMETER_NAME) as string, type: outs[0].to };
        } else {
            throw new Error('too many outputs for this function');
        }
    }

    getInputs(functionType: Type): NameTypePair[] {
        return functionType.getOutgoingEdges(INPUT_PARAMETER)
            .sort((e1, e2) => (e2.properties.get(PARAMETER_ORDER) as number) - (e1.properties.get(PARAMETER_ORDER) as number))
            .map(edge => <NameTypePair>{ name: edge.properties.get(PARAMETER_NAME) as string, type: edge.to });
    }
}

// when the name is missing (e.g. for functions or their input/output parameters), use this value instead
export const FUNCTION_MISSING_NAME = '';

const OUTPUT_PARAMETER = 'isOutput';
const INPUT_PARAMETER = 'isInput';
const PARAMETER_NAME = 'parameterName';
const PARAMETER_ORDER = 'parameterOrder';
const SIMPLE_NAME = 'simpleFunctionName';

export function isFunctionKind(kind: unknown): kind is FunctionKind {
    return isKind(kind) && kind.$name === FunctionKindName;
}
