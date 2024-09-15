/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeEqualityProblem } from '../features/equality.js';
import { CompositeTypeInferenceRule, InferenceProblem, InferenceRuleNotApplicable } from '../features/inference.js';
import { SubTypeProblem } from '../features/subtype.js';
import { DefaultValidationCollector, ValidationCollector, ValidationProblem } from '../features/validation.js';
import { Type, isType } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { NameTypePair, TypeSelector, TypirProblem, resolveTypeSelector } from '../utils/utils-definitions.js';
import { checkNameTypePair, checkNameTypePairs, checkTypes, checkValueForConflict, createKindConflict } from '../utils/utils-type-comparison.js';
import { assertTrue } from '../utils/utils.js';
import { Kind, isKind } from './kind.js';

export class FunctionType extends Type {
    override readonly kind: FunctionKind;
    readonly functionName: string;
    readonly outputParameter: NameTypePair | undefined;
    readonly inputParameters: NameTypePair[];

    constructor(kind: FunctionKind, identifier: string, typeDetails: FunctionTypeDetails) {
        super(identifier);
        this.kind = kind;
        this.functionName = typeDetails.functionName;

        // output parameter
        const outputType = typeDetails.outputParameter ? resolveTypeSelector(this.kind.typir, typeDetails.outputParameter.type) : undefined;
        if (typeDetails.outputParameter) {
            assertTrue(outputType !== undefined);
            this.kind.enforceName(typeDetails.outputParameter.name, this.kind.options.enforceOutputParameterName);
            this.outputParameter = {
                name: typeDetails.outputParameter.name,
                type: outputType,
            };
        } else {
            // no output parameter
            this.outputParameter = undefined;
        }

        // input parameters
        this.inputParameters = typeDetails.inputParameters.map(input => {
            this.kind.enforceName(input.name, this.kind.options.enforceInputParameterNames);
            return <NameTypePair>{
                name: input.name,
                type: resolveTypeSelector(this.kind.typir, input.type),
            };
        });
    }

    override getUserRepresentation(): string {
        // inputs
        const inputs = this.getInputs();
        const inputsString = inputs.map(input => this.kind.getUserRepresentationNameTypePair(input)).join(', ');
        // output
        const output = this.getOutput();
        const outputString = output
            ? (this.kind.hasName(output.name) ? `(${this.kind.getUserRepresentationNameTypePair(output)})` : this.kind.typir.printer.printType(output.type))
            : undefined;
        // function name
        const simpleFunctionName = this.getSimpleFunctionName();
        // complete signature
        if (this.kind.hasName(simpleFunctionName)) {
            const outputValue = outputString ? `: ${outputString}` : '';
            return `${simpleFunctionName}(${inputsString})${outputValue}`;
        } else {
            return `(${inputsString}) => ${outputString ?? '()'}`;
        }
    }

    override analyzeTypeEqualityProblems(otherType: Type): TypirProblem[] {
        if (isFunctionType(otherType)) {
            const conflicts: TypirProblem[] = [];
            // same name? TODO is this correct??
            if (this.kind.options.enforceFunctionName) {
                conflicts.push(...checkValueForConflict(this.getSimpleFunctionName(), otherType.getSimpleFunctionName(), 'simple name'));
            }
            // same output?
            conflicts.push(...checkNameTypePair(this.getOutput(), otherType.getOutput(),
                this.kind.options.enforceOutputParameterName, (s, t) => this.kind.typir.equality.getTypeEqualityProblem(s, t)));
            // same input?
            conflicts.push(...checkNameTypePairs(this.getInputs(), otherType.getInputs(),
                this.kind.options.enforceInputParameterNames, (s, t) => this.kind.typir.equality.getTypeEqualityProblem(s, t)));
            return conflicts;
        } else {
            return [<TypeEqualityProblem>{
                $problem: TypeEqualityProblem,
                type1: this,
                type2: otherType,
                subProblems: [createKindConflict(otherType, this)],
            }];
        }
    }

    override analyzeIsSubTypeOf(superType: Type): TypirProblem[] {
        if (isFunctionType(superType)) {
            return this.analyzeSubTypeProblems(this, superType);
        }
        return [<SubTypeProblem>{
            $problem: SubTypeProblem,
            superType,
            subType: this,
            subProblems: [createKindConflict(this, superType)],
        }];
    }

    override analyzeIsSuperTypeOf(subType: Type): TypirProblem[] {
        if (isFunctionType(subType)) {
            return this.analyzeSubTypeProblems(subType, this);
        }
        return [<SubTypeProblem>{
            $problem: SubTypeProblem,
            superType: this,
            subType,
            subProblems: [createKindConflict(subType, this)],
        }];
    }

    protected analyzeSubTypeProblems(subType: FunctionType, superType: FunctionType): TypirProblem[] {
        const conflicts: TypirProblem[] = [];
        // TODO sub-type relationship instead of assignability relationship??
        // output: sub type output must be assignable to super type output
        conflicts.push(...checkNameTypePair(subType.getOutput(), superType.getOutput(),
            this.kind.options.enforceOutputParameterName, (sub, superr) => this.kind.typir.assignability.getAssignabilityProblem(sub, superr)));
        // input: super type inputs must be assignable to sub type inputs
        conflicts.push(...checkNameTypePairs(subType.getInputs(), superType.getInputs(),
            this.kind.options.enforceInputParameterNames, (sub, superr) => this.kind.typir.assignability.getAssignabilityProblem(superr, sub)));
        return conflicts;
    }

    getSimpleFunctionName(): string {
        return this.functionName;
    }

    getOutput(): NameTypePair | undefined {
        return this.outputParameter;
    }

    getInputs(): NameTypePair[] {
        return this.inputParameters;
    }
}

export function isFunctionType(type: unknown): type is FunctionType {
    return isType(type) && isFunctionKind(type.kind);
}



export interface FunctionKindOptions {
    // these three options controls structural vs nominal typing somehow ...
    enforceFunctionName: boolean,
    enforceInputParameterNames: boolean,
    enforceOutputParameterName: boolean,
    /** Will be used only internally as prefix for the unique identifiers for function type names. */
    identifierPrefix: string,
    /** If a function has no output type (e.g. "void" functions), this type is returned during the type inference of calls to these functions.
     * The default value "undefined" indicates to throw an error, i.e. type inference for calls of such functions are not allowed. */
    typeToInferForCallsOfFunctionsWithoutOutput: TypeSelector | undefined;
}

export const FunctionKindName = 'FunctionKind';

export interface ParameterDetails {
    name: string;
    type: TypeSelector;
}

export interface FunctionTypeDetails {
    functionName: string,
    /** The order of parameters is important! */
    outputParameter: ParameterDetails | undefined,
    inputParameters: ParameterDetails[],
}
export interface CreateFunctionTypeDetails<T> extends FunctionTypeDetails {
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
    functionType: FunctionType;
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
        this.$name = FunctionKindName;
        this.typir = typir;
        this.typir.registerKind(this);
        this.options = {
            // the default values:
            enforceFunctionName: false,
            enforceInputParameterNames: false,
            enforceOutputParameterName: false,
            identifierPrefix: 'function',
            typeToInferForCallsOfFunctionsWithoutOutput: undefined,
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
                                    const expectedParameterTypes = singleFunction.functionType.getInputs();
                                    // check, that the given number of parameters is the same as the expected number of input parameters
                                    const currentProblems: ValidationProblem[] = [];
                                    // TODO use existing helper functions for that? that are no "ValidationProblem"s, but IndexedTypeConflicts, AssignabilityProblems?
                                    const parameterLength = checkValueForConflict(expectedParameterTypes.length, inputArguments.length, 'number of input parameter values');
                                    if (parameterLength.length >= 1) {
                                        currentProblems.push({
                                            $problem: ValidationProblem,
                                            domainElement,
                                            severity: 'error',
                                            message: 'The number of given parameter values does not match the expected number of input parameters.',
                                            subProblems: parameterLength,
                                        });
                                    } else {
                                        // there are parameter values to check their types
                                        const inferredParameterTypes = inputArguments.map(p => typir.inference.inferType(p));
                                        for (let i = 0; i < inputArguments.length; i++) {
                                            const expectedType = expectedParameterTypes[i];
                                            const inferredType = inferredParameterTypes[i];
                                            if (isType(inferredType)) {
                                                const parameterComparison = typir.assignability.getAssignabilityProblem(inferredType, expectedType.type);
                                                if (parameterComparison !== undefined) {
                                                    // the value is not assignable to the type of the input parameter
                                                    currentProblems.push({
                                                        $problem: ValidationProblem,
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
                                                    $problem: ValidationProblem,
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
                                            $problem: ValidationProblem,
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
                                $problem: ValidationProblem,
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

    getFunctionType(typeDetails: FunctionTypeDetails): FunctionType | undefined {
        const key = this.calculateIdentifier(typeDetails);
        return this.typir.graph.getType(key) as FunctionType;
    }

    getOrCreateFunctionType<T>(typeDetails: CreateFunctionTypeDetails<T>): FunctionType {
        const result = this.getFunctionType(typeDetails);
        if (result) {
            return result;
        }
        return this.createFunctionType(typeDetails);
    }

    createFunctionType<T>(typeDetails: CreateFunctionTypeDetails<T>): FunctionType {
        const functionName = typeDetails.functionName;

        // check the input
        if (!typeDetails) {
            throw new Error('is undefined');
        }
        if (typeDetails.outputParameter === undefined && typeDetails.inferenceRuleForCalls) {
            // no output parameter => no inference rule for calling this function
            throw new Error(`A function '${functionName}' without output parameter cannot have an inferred type, when this function is called!`);
        }
        this.enforceName(functionName, this.options.enforceFunctionName);

        // create the function type
        const functionType = new FunctionType(this, this.calculateIdentifier(typeDetails), typeDetails);
        this.typir.graph.addNode(functionType);

        // output parameter for function calls
        const outputTypeForFunctionCalls = functionType.getOutput()?.type ?? // by default, use the return type of the function ...
            // ... if this type is missing, use the specified type for this case in the options:
            (this.options.typeToInferForCallsOfFunctionsWithoutOutput ? resolveTypeSelector(this.typir, this.options.typeToInferForCallsOfFunctionsWithoutOutput) : undefined);

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
            overloaded.sameOutputType = outputTypeForFunctionCalls;
        } else {
            if (overloaded.sameOutputType && outputTypeForFunctionCalls && this.typir.equality.areTypesEqual(overloaded.sameOutputType, outputTypeForFunctionCalls) === true) {
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

        if (typeDetails.inferenceRuleForCalls) {
            /** Preconditions:
             * - there is a rule which specifies how to infer the current function type
             * - the current function has an output type/parameter, otherwise, this function could not provide any type (and throws an error), when it is called!
             *   (exception: the options contain a type to return in this special case)
             */
            function check(returnType: Type | undefined): Type {
                if (returnType) {
                    return returnType;
                } else {
                    throw new Error(`The function ${functionName} is called, but has no output type to infer.`)
                }
            }

            // register inference rule for calls of the new function
            overloaded.inference.subRules.push({
                inferTypeWithoutChildren(domainElement, _typir) {
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
                                    return check(outputTypeForFunctionCalls);
                                }
                            } else {
                                // there are no operands to check
                                return check(outputTypeForFunctionCalls);
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
                    const inputTypes = typeDetails.inputParameters.map(p => resolveTypeSelector(typir, p.type));
                    // all operands need to be assignable(! not equal) to the required types
                    const comparisonConflicts = checkTypes(childrenTypes, inputTypes,
                        (t1, t2) => typir.assignability.getAssignabilityProblem(t1, t2));
                    if (comparisonConflicts.length >= 1) {
                        // this function type does not match, due to assignability conflicts => return them as errors
                        return {
                            $problem: InferenceProblem,
                            domainElement,
                            inferenceCandidate: functionType,
                            location: 'input parameters',
                            rule: this,
                            subProblems: comparisonConflicts,
                        };
                        // We have a dedicated validation for this case (see below), but a resulting error might be ignored by the user => return the problem during type-inference again
                    } else {
                        // matching => return the return type of the function for the case of a function call!
                        return check(outputTypeForFunctionCalls); // this case occurs only, if the current function has an output type/parameter!
                    }
                },
            });
        }

        // register inference rule for the declaration of the new function
        // (regarding overloaded function, for now, it is assumed, that the given inference rule itself is concrete enough to handle overloaded functions itself!)
        if (typeDetails.inferenceRuleForDeclaration) {
            this.typir.inference.addInferenceRule((domainElement, _typir) => {
                if (typeDetails.inferenceRuleForDeclaration!(domainElement)) {
                    return functionType;
                } else {
                    return InferenceRuleNotApplicable;
                }
            });
        }

        return functionType;
    }

    calculateIdentifier(typeDetails: FunctionTypeDetails): string {
        return this.printFunctionType(typeDetails);
    }

    protected createValidationServiceForFunctions(): ValidationCollector {
        return new DefaultValidationCollector(this.typir);
    }

    getUserRepresentationNameTypePair(pair: NameTypePair): string {
        const typeName = this.typir.printer.printType(pair.type);
        if (this.hasName(pair.name)) {
            return `${pair.name}: ${typeName}`;
        } else {
            return typeName;
        }
    }

    protected printFunctionType(typeDetails: FunctionTypeDetails): string {
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

    protected printNameTypePair(pair: ParameterDetails): string {
        const typeName = this.typir.printer.printType(resolveTypeSelector(this.typir, pair.type));
        if (this.hasName(pair.name)) {
            return `${pair.name}:${typeName}`;
        } else {
            return typeName;
        }
    }

    enforceName(name: string | undefined, enforce: boolean) {
        if (enforce && this.hasName(name) === false) {
            throw new Error('a name is required');
        }
    }
    hasName(name: string | undefined): name is string {
        return name !== undefined && name !== FUNCTION_MISSING_NAME;
    }

}

// when the name is missing (e.g. for functions or their input/output parameters), use this value instead
export const FUNCTION_MISSING_NAME = '';

export function isFunctionKind(kind: unknown): kind is FunctionKind {
    return isKind(kind) && kind.$name === FunctionKindName;
}
