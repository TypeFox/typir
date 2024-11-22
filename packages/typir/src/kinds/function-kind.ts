/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeEqualityProblem } from '../features/equality.js';
import { CompositeTypeInferenceRule, InferenceProblem, InferenceRuleNotApplicable, TypeInferenceRule } from '../features/inference.js';
import { SubTypeProblem } from '../features/subtype.js';
import { ValidationProblem, ValidationRuleWithBeforeAfter } from '../features/validation.js';
import { TypeEdge } from '../graph/type-edge.js';
import { TypeGraphListener } from '../graph/type-graph.js';
import { Type, TypeStateListener, isType } from '../graph/type-node.js';
import { TypirServices } from '../typir.js';
import { TypeInitializer } from '../utils/type-initialization.js';
import { NameTypePair, TypeReference, TypeSelector, TypirProblem, resolveTypeSelector } from '../utils/utils-definitions.js';
import { TypeCheckStrategy, checkTypeArrays, checkTypes, checkValueForConflict, createKindConflict, createTypeCheckStrategy } from '../utils/utils-type-comparison.js';
import { assertTrue, assertType, assertUnreachable } from '../utils/utils.js';
import { Kind, isKind } from './kind.js';

export class FunctionType extends Type {
    override readonly kind: FunctionKind;

    readonly functionName: string;
    readonly outputParameter: ParameterDetails | undefined;
    readonly inputParameters: ParameterDetails[];

    constructor(kind: FunctionKind, typeDetails: FunctionTypeDetails) {
        super(undefined);
        this.kind = kind;
        this.functionName = typeDetails.functionName;

        // output parameter
        const outputType = typeDetails.outputParameter ? new TypeReference(typeDetails.outputParameter.type, this.kind.services) : undefined;
        if (typeDetails.outputParameter) {
            assertTrue(outputType !== undefined);
            this.kind.enforceParameterName(typeDetails.outputParameter.name, this.kind.options.enforceOutputParameterName);
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
            this.kind.enforceParameterName(input.name, this.kind.options.enforceInputParameterNames);
            return <ParameterDetails>{
                name: input.name,
                type: new TypeReference(input.type, this.kind.services),
            };
        });

        // define to wait for the parameter types
        const allParameterRefs = this.inputParameters.map(p => p.type);
        if (outputType) {
            allParameterRefs.push(outputType);
        }
        this.defineTheInitializationProcessOfThisType({
            preconditionsForIdentifiable: {
                referencesToBeIdentifiable: allParameterRefs,
            },
            referencesRelevantForInvalidation: allParameterRefs,
            onIdentifiable: () => {
                // the identifier is calculated now
                this.identifier = this.kind.calculateIdentifier(typeDetails);
                // the registration of the type in the type graph is done by the TypeInitializer
            },
            onCompleted: () => {
                // no additional checks so far
            },
            onInvalidated: () => {
                // nothing to do
            },
        });
    }

    override getName(): string {
        return `${this.getSimpleFunctionName()}`;
    }

    override getUserRepresentation(): string {
        // function name
        const simpleFunctionName = this.getSimpleFunctionName();
        // inputs
        const inputs = this.getInputs();
        const inputsString = inputs.map(input => this.kind.getParameterRepresentation(input)).join(', ');
        // output
        const output = this.getOutput();
        const outputString = output
            ? (this.kind.hasParameterName(output.name) ? `(${this.kind.getParameterRepresentation(output)})` : output.type.getName())
            : undefined;
        // complete signature
        if (this.kind.hasFunctionName(simpleFunctionName)) {
            const outputValue = outputString ? `: ${outputString}` : '';
            return `${simpleFunctionName}(${inputsString})${outputValue}`;
        } else {
            return `(${inputsString}) => ${outputString ?? '()'}`;
        }
    }

    override analyzeTypeEqualityProblems(otherType: Type): TypirProblem[] {
        if (isFunctionType(otherType)) {
            const conflicts: TypirProblem[] = [];
            // same name? since functions with different names are different
            if (this.kind.options.enforceFunctionName) {
                conflicts.push(...checkValueForConflict(this.getSimpleFunctionName(), otherType.getSimpleFunctionName(), 'simple name'));
            }
            // same output?
            conflicts.push(...checkTypes(this.getOutput(), otherType.getOutput(),
                (s, t) => this.kind.services.equality.getTypeEqualityProblem(s, t), this.kind.options.enforceOutputParameterName));
            // same input?
            conflicts.push(...checkTypeArrays(this.getInputs(), otherType.getInputs(),
                (s, t) => this.kind.services.equality.getTypeEqualityProblem(s, t), this.kind.options.enforceInputParameterNames));
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
        const strategy = createTypeCheckStrategy(this.kind.options.subtypeParameterChecking, this.kind.services);
        // output: sub type output must be assignable (which can be configured) to super type output
        conflicts.push(...checkTypes(subType.getOutput(), superType.getOutput(),
            (sub, superr) => strategy(sub, superr), this.kind.options.enforceOutputParameterName));
        // input: super type inputs must be assignable (which can be configured) to sub type inputs
        conflicts.push(...checkTypeArrays(subType.getInputs(), superType.getInputs(),
            (sub, superr) => strategy(superr, sub), this.kind.options.enforceInputParameterNames));
        return conflicts;
    }

    getSimpleFunctionName(): string {
        return this.functionName;
    }

    getOutput(notResolvedBehavior: 'EXCEPTION' | 'RETURN_UNDEFINED' = 'EXCEPTION'): NameTypePair | undefined {
        if (this.outputParameter) {
            const type = this.outputParameter.type.getType();
            if (type) {
                return <NameTypePair>{
                    name: this.outputParameter.name,
                    type,
                };
            } else {
                switch (notResolvedBehavior) {
                    case 'EXCEPTION':
                        throw new Error(`Output parameter ${this.outputParameter.name} is not resolved.`);
                    case 'RETURN_UNDEFINED':
                        return undefined;
                    default:
                        assertUnreachable(notResolvedBehavior);
                }
            }
        } else {
            return undefined;
        }
    }

    getInputs(): NameTypePair[] {
        return this.inputParameters.map(param => {
            const type = param.type.getType();
            if (type) {
                return <NameTypePair>{
                    name: param.name,
                    type,
                };
            } else {
                throw new Error(`Input parameter ${param.name} is not resolved.`);
            }
        });
    }
}

export function isFunctionType(type: unknown): type is FunctionType {
    return isType(type) && isFunctionKind(type.kind);
}

export interface ParameterDetails {
    name: string;
    type: TypeReference<Type>;
}



export interface FunctionKindOptions {
    // these three options controls structural vs nominal typing somehow ...
    enforceFunctionName: boolean,
    enforceInputParameterNames: boolean,
    enforceOutputParameterName: boolean,
    /** Will be used only internally as prefix for the unique identifiers for function type names. */
    identifierPrefix: string,
    /** If a function has no output type (e.g. "void" functions), this type is returned during the type inference of calls to these functions.
     * The default value "THROW_ERROR" indicates to throw an error, i.e. type inference for calls of such functions are not allowed. */
    typeToInferForCallsOfFunctionsWithoutOutput: 'THROW_ERROR' | TypeSelector;
    subtypeParameterChecking: TypeCheckStrategy;
}

export const FunctionKindName = 'FunctionKind';

export interface CreateParameterDetails {
    name: string;
    type: TypeSelector;
}

export interface FunctionTypeDetails {
    functionName: string,
    /** The order of parameters is important! */
    outputParameter: CreateParameterDetails | undefined,
    inputParameters: CreateParameterDetails[],
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
 * Constraints of overloaded functions:
 * - no duplicated variants!
 * - The names of all paramaters don't matter for functions to be unique.
 * - a variant is uniquely identified by: function name (if available), types of input parameters; options.identifierPrefix
 * - For overloaded functions, it is not enough to have different output types or different parameter names!
 *
 * TODO possible Extensions:
 * - multiple output parameters
 * - create variants of this, e.g. functions, procedures, lambdas
 * - (structural vs nominal typing? somehow realized by the three options above ...)
 * - optional parameters
 * - parameters which are used for output AND input
 */
export class FunctionKind implements Kind, TypeGraphListener {
    readonly $name: 'FunctionKind';
    readonly services: TypirServices;
    readonly options: Readonly<FunctionKindOptions>;
    /** Limitations
     * - Works only, if function types are defined using the createFunctionType(...) function below!
     */
    readonly mapNameTypes: Map<string, OverloadedFunctionDetails> = new Map(); // function name => all overloaded functions with this name/key
    // TODO try to replace this map with calculating the required identifier for the function

    constructor(services: TypirServices, options?: Partial<FunctionKindOptions>) {
        this.$name = FunctionKindName;
        this.services = services;
        this.services.kinds.register(this);
        this.options = {
            // the default values:
            enforceFunctionName: false,
            enforceInputParameterNames: false,
            enforceOutputParameterName: false,
            identifierPrefix: 'function',
            typeToInferForCallsOfFunctionsWithoutOutput: 'THROW_ERROR',
            subtypeParameterChecking: 'SUB_TYPE',
            // the actually overriden values:
            ...options
        };

        // register Validations for input arguments of function calls (must be done here to support overloaded functions)
        this.services.validation.collector.addValidationRule(
            (domainElement, typir) => {
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
                                            const parameterProblems = checkTypes(inferredType, expectedType, createTypeCheckStrategy('ASSIGNABLE_TYPE', typir), true);
                                            if (parameterProblems.length >= 1) {
                                                // the value is not assignable to the type of the input parameter
                                                // create one ValidationProblem for each problematic parameter!
                                                currentProblems.push({
                                                    $problem: ValidationProblem,
                                                    domainElement: inputArguments[i],
                                                    severity: 'error',
                                                    message: `The parameter '${expectedType.name}' at index ${i} got a value with a wrong type.`,
                                                    subProblems: parameterProblems,
                                                });
                                            } else {
                                                // this parameter value is fine
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
                                            message: `The given operands for the function '${this.services.printer.printTypeName(singleFunction.functionType)}' match the expected types only partially.`,
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

    getFunctionType(typeDetails: FunctionTypeDetails): TypeReference<FunctionType> {
        return new TypeReference(() => this.calculateIdentifier(typeDetails), this.services);
    }

    createFunctionType<T>(typeDetails: CreateFunctionTypeDetails<T>): TypeInitializer<FunctionType> {
        return new FunctionTypeInitializer(this.services, this, typeDetails);
    }

    getOutputTypeForFunctionCalls(functionType: FunctionType): Type | undefined {
        return functionType.getOutput('RETURN_UNDEFINED')?.type ?? // by default, use the return type of the function ...
            // ... if this type is missing, use the specified type for this case in the options:
            // 'THROW_ERROR': an error will be thrown later, when this case actually occurs!
            (this.options.typeToInferForCallsOfFunctionsWithoutOutput === 'THROW_ERROR'
                ? undefined
                : resolveTypeSelector(this.services, this.options.typeToInferForCallsOfFunctionsWithoutOutput));
    }


    /* Get informed about deleted types in order to remove inference rules which are bound to them. */

    addedType(_newType: Type, _key: string): void {
        // do nothing
    }
    removedType(type: Type, _key: string): void {
        if (isFunctionType(type)) {
            const overloads = this.mapNameTypes.get(type.functionName);
            if (overloads) {
                // remove the current function
                const index = overloads.overloadedFunctions.findIndex(o => o.functionType === type);
                if (index >= 0) {
                    overloads.overloadedFunctions.splice(index, 1);
                }
                // its inference rule is removed by the CompositeTypeInferenceRule => nothing to do here
            }
        }
    }
    addedEdge(_edge: TypeEdge): void {
        // do nothing
    }
    removedEdge(_edge: TypeEdge): void {
        // do nothing
    }


    calculateIdentifier(typeDetails: FunctionTypeDetails): string {
        const prefix = this.options.identifierPrefix ? this.options.identifierPrefix + '-' : '';
        // function name, if wanted
        const functionName = this.hasFunctionName(typeDetails.functionName) ? typeDetails.functionName : '';
        // inputs: type identifiers in defined order
        const inputsString = typeDetails.inputParameters.map(input => resolveTypeSelector(this.services, input.type).getIdentifier()).join(',');
        // output: type identifier
        const outputString = typeDetails.outputParameter ? resolveTypeSelector(this.services, typeDetails.outputParameter.type).getIdentifier() : '';
        // complete signature
        return `${prefix}${functionName}(${inputsString}):${outputString}`;
    }

    getParameterRepresentation(parameter: NameTypePair): string {
        const typeName = parameter.type.getName();
        if (this.hasParameterName(parameter.name)) {
            return `${parameter.name}: ${typeName}`;
        } else {
            return typeName;
        }
    }

    enforceFunctionName(name: string | undefined, enforce: boolean): void {
        if (enforce && this.hasFunctionName(name) === false) {
            throw new Error('A name for the function is required.');
        }
    }
    hasFunctionName(name: string | undefined): name is string {
        return name !== undefined && name !== NO_FUNCTION_NAME;
    }

    enforceParameterName(name: string | undefined, enforce: boolean): void {
        if (enforce && this.hasParameterName(name) === false) {
            throw new Error('A name for the parameter is required.');
        }
    }
    hasParameterName(name: string | undefined): name is string {
        return name !== undefined && name !== NO_PARAMETER_NAME;
    }

}

// when the name is missing (e.g. for functions or their input/output parameters), use these values instead
export const NO_FUNCTION_NAME = '';
export const NO_PARAMETER_NAME = '';

export function isFunctionKind(kind: unknown): kind is FunctionKind {
    return isKind(kind) && kind.$name === FunctionKindName;
}


export class FunctionTypeInitializer<T> extends TypeInitializer<FunctionType> implements TypeStateListener {
    protected readonly typeDetails: CreateFunctionTypeDetails<T>;
    protected readonly kind: FunctionKind;
    protected inferenceRules: FunctionInferenceRules;
    protected initialFunctionType: FunctionType;

    constructor(services: TypirServices, kind: FunctionKind, typeDetails: CreateFunctionTypeDetails<T>) {
        super(services);
        this.typeDetails = typeDetails;
        this.kind = kind;

        const functionName = typeDetails.functionName;

        // check the input
        if (typeDetails.outputParameter === undefined && typeDetails.inferenceRuleForCalls) {
            // no output parameter => no inference rule for calling this function
            throw new Error(`A function '${functionName}' without output parameter cannot have an inferred type, when this function is called!`);
        }
        kind.enforceFunctionName(functionName, kind.options.enforceFunctionName);

        // prepare the overloads
        let overloaded = this.kind.mapNameTypes.get(functionName);
        if (overloaded) {
            // do nothing
        } else {
            overloaded = {
                overloadedFunctions: [],
                inference: new CompositeTypeInferenceRule(this.services),
                sameOutputType: undefined,
            };
            this.kind.mapNameTypes.set(functionName, overloaded);
            this.services.inference.addInferenceRule(overloaded.inference);
        }

        // create the new Function type
        this.initialFunctionType = new FunctionType(kind, typeDetails);

        this.inferenceRules = createInferenceRules(typeDetails, kind, this.initialFunctionType);
        registerInferenceRules(this.inferenceRules, kind, functionName, undefined);

        this.initialFunctionType.addListener(this, true);
    }

    override getTypeInitial(): FunctionType {
        return this.initialFunctionType;
    }

    switchedToIdentifiable(functionType: Type): void {
        const functionName = this.typeDetails.functionName;
        assertType(functionType, isFunctionType);
        const readyFunctionType = this.producedType(functionType);
        if (readyFunctionType !== functionType) {
            functionType.removeListener(this);
            deregisterInferenceRules(this.inferenceRules, this.kind, functionName, undefined);
            this.inferenceRules = createInferenceRules(this.typeDetails, this.kind, readyFunctionType);
            registerInferenceRules(this.inferenceRules, this.kind, functionName, readyFunctionType);
        } else {
            deregisterInferenceRules(this.inferenceRules, this.kind, functionName, undefined);
            registerInferenceRules(this.inferenceRules, this.kind, functionName, readyFunctionType);
        }

        // remember the new function for later in order to enable overloaded functions!
        // const functionName = typeDetails.functionName;
        const outputTypeForFunctionCalls = this.kind.getOutputTypeForFunctionCalls(readyFunctionType); // output parameter for function calls
        const overloaded = this.kind.mapNameTypes.get(functionName)!;
        if (overloaded.overloadedFunctions.length <= 0) {
            // remember the output type of the first function
            overloaded.sameOutputType = outputTypeForFunctionCalls;
        } else {
            if (overloaded.sameOutputType && outputTypeForFunctionCalls && this.services.equality.areTypesEqual(overloaded.sameOutputType, outputTypeForFunctionCalls) === true) {
                // the output types of all overloaded functions are the same for now
            } else {
                // there is a difference
                overloaded.sameOutputType = undefined;
            }
        }
        overloaded.overloadedFunctions.push({
            functionType: readyFunctionType,
            inferenceRuleForCalls: this.typeDetails.inferenceRuleForCalls,
        });
    }

    switchedToCompleted(functionType: Type): void {
        functionType.removeListener(this);
    }

    switchedToInvalid(_functionType: Type): void {
        // empty
    }
}

interface FunctionInferenceRules {
    forCall?: TypeInferenceRule;
    forDeclaration?: TypeInferenceRule;
}

function registerInferenceRules(rules: FunctionInferenceRules, functionKind: FunctionKind, functionName: string, functionType: FunctionType | undefined): void {
    if (rules.forCall) {
        const overloaded = functionKind.mapNameTypes.get(functionName)!;
        overloaded.inference.addInferenceRule(rules.forCall, functionType);
    }

    if (rules.forDeclaration) {
        functionKind.services.inference.addInferenceRule(rules.forDeclaration, functionType);
    }
}

function deregisterInferenceRules(rules: FunctionInferenceRules, functionKind: FunctionKind, functionName: string, functionType: FunctionType | undefined): void {
    if (rules.forCall) {
        const overloaded = functionKind.mapNameTypes.get(functionName);
        overloaded?.inference.removeInferenceRule(rules.forCall, functionType);
    }

    if (rules.forDeclaration) {
        functionKind.services.inference.removeInferenceRule(rules.forDeclaration, functionType);
    }
}

function createInferenceRules<T>(typeDetails: CreateFunctionTypeDetails<T>, functionKind: FunctionKind, functionType: FunctionType): FunctionInferenceRules {
    const result: FunctionInferenceRules = {};
    const functionName = typeDetails.functionName;
    const mapNameTypes = functionKind.mapNameTypes;
    const outputTypeForFunctionCalls = functionKind.getOutputTypeForFunctionCalls(functionType);
    if (typeDetails.inferenceRuleForCalls) { // TODO warum wird hier nicht einfach "outputTypeForFunctionCalls !== undefined" überprüft??
        /** Preconditions:
         * - there is a rule which specifies how to infer the current function type
         * - the current function has an output type/parameter, otherwise, this function could not provide any type (and throws an error), when it is called!
         *   (exception: the options contain a type to return in this special case)
         */
        function check(returnType: Type | undefined): Type {
            if (returnType) {
                return returnType;
            } else {
                throw new Error(`The function ${functionName} is called, but has no output type to infer.`);
            }
        }

        // register inference rule for calls of the new function
        // TODO what about the case, that multiple variants match?? after implicit conversion for example?! => overload with the lowest number of conversions wins!
        result.forCall = {
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
                const comparisonConflicts = checkTypeArrays(childrenTypes, inputTypes,
                    (t1, t2) => typir.assignability.getAssignabilityProblem(t1, t2), true);
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
                    return check(outputTypeForFunctionCalls);
                }
            },
        };
    }

    // register inference rule for the declaration of the new function
    // (regarding overloaded function, for now, it is assumed, that the given inference rule itself is concrete enough to handle overloaded functions itself!)
    if (typeDetails.inferenceRuleForDeclaration) {
        result.forDeclaration = (domainElement, _typir) => {
            if (typeDetails.inferenceRuleForDeclaration!(domainElement)) {
                return functionType;
            } else {
                return InferenceRuleNotApplicable;
            }
        };
    }

    return result;
}


/**
 * Predefined validation to produce errors for those overloaded functions which cannot be distinguished when calling them.
 */
export class UniqueFunctionValidation implements ValidationRuleWithBeforeAfter {
    protected readonly foundDeclarations: Map<string, unknown[]> = new Map();
    protected readonly services: TypirServices;
    protected readonly isRelevant: (domainElement: unknown) => boolean; // using this check improves performance a lot

    constructor(services: TypirServices, isRelevant: (domainElement: unknown) => boolean) {
        this.services = services;
        this.isRelevant = isRelevant;
    }

    beforeValidation(_domainRoot: unknown, _typir: TypirServices): ValidationProblem[] {
        this.foundDeclarations.clear();
        return [];
    }

    validation(domainElement: unknown, _typir: TypirServices): ValidationProblem[] {
        if (this.isRelevant(domainElement)) { // improves performance, since type inference need to be done only for relevant elements
            const type = this.services.inference.inferType(domainElement);
            if (isFunctionType(type)) {
                // register domain elements which have FunctionTypes with a key for their uniques
                const key = this.calculateFunctionKey(type);
                let entries = this.foundDeclarations.get(key);
                if (!entries) {
                    entries = [];
                    this.foundDeclarations.set(key, entries);
                }
                entries.push(domainElement);
            }
        }
        return [];
    }

    /**
     * Calculates a key for a function which encodes its unique properties, i.e. duplicate functions have the same key.
     * This key is used to identify duplicated functions.
     * Override this method to change the properties which make a function unique.
     * @param func the current function type
     * @returns a string key
     */
    protected calculateFunctionKey(func: FunctionType): string {
        return `${func.functionName}(${func.getInputs().map(param => param.type.getIdentifier())})`;
    }

    afterValidation(_domainRoot: unknown, _typir: TypirServices): ValidationProblem[] {
        const result: ValidationProblem[] = [];
        for (const [key, functions] of this.foundDeclarations.entries()) {
            if (functions.length >= 2) {
                for (const func of functions) {
                    result.push({
                        $problem: ValidationProblem,
                        domainElement: func,
                        severity: 'error',
                        message: `Declared functions need to be unique (${key}).`,
                    });
                }
            }
        }

        this.foundDeclarations.clear();
        return result;
    }
}
