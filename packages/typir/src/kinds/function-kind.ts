/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { assertUnreachable } from 'langium';
import { TypeEdge } from '../graph/type-edge.js';
import { Type } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { TypeConflict, compareForConflict, compareNameTypePair, compareNameTypePairs, compareTypes } from '../utils/utils-type-comparison.js';
import { NameTypePair } from '../utils/utils.js';
import { Kind, isKind } from './kind.js';

export type InferFunctionCall = (domainElement: unknown) => boolean | unknown[];
export type InferFunctionType = (domainElement: unknown) => boolean;

export interface FunctionKindOptions {
    // these three options controls structural vs nominal typing somehow ...
    enforceFunctionName: boolean,
    enforceInputParameterNames: boolean,
    enforceOutputParameterName: boolean,
}

export const FunctionKindName = 'FunctionKind';

/**
 * Represents signatures of executable code.
 *
 * TODO possible Extensions:
 * - multiple output parameters
 * - create variants of this, e.g. functions, procedures, lambdas
 * - (structural vs nominal typing? somehow realized by the three options above ...)
 * - function overloading?
 * - optional parameters
 */
export class FunctionKind implements Kind {
    readonly $name: 'FunctionKind';
    readonly typir: Typir;
    readonly options: FunctionKindOptions;

    constructor(typir: Typir, options?: Partial<FunctionKindOptions>) {
        this.$name = 'FunctionKind';
        this.typir = typir;
        this.typir.registerKind(this);
        this.options = {
            // the default values:
            enforceFunctionName: false,
            enforceInputParameterNames: false,
            enforceOutputParameterName: false,
            // the actually overriden values:
            ...options
        };
    }

    createFunctionType(functionName: string,
        outputParameter: NameTypePair | undefined,
        inputParameter: NameTypePair[],
        // inference rules:
        inferenceRuleForDeclaration?: InferFunctionType, // for function declarations => returns the funtion type (the whole signature including all names)
        inferenceRuleForCalls?: InferFunctionCall, // for function calls => returns the return type of the function
        // TODO for function references (like the declaration, but without any names!)
    ): Type {
        // the order of parameters is important!

        // create the function type
        this.enforceName(functionName, this.options.enforceFunctionName);
        const uniqueTypeName = this.printFunctionType(functionName, inputParameter, outputParameter);
        const functionType = new Type(this, uniqueTypeName);
        functionType.properties.set(SIMPLE_NAME, functionName);
        this.typir.graph.addNode(functionType);

        // output parameter
        if (outputParameter) {
            const edge = new TypeEdge(functionType, outputParameter.type, OUTPUT_PARAMETER);
            this.enforceName(outputParameter.name, this.options.enforceOutputParameterName);
            edge.properties.set(PARAMETER_NAME, outputParameter.name);
            this.typir.graph.addEdge(edge);
        }

        // input parameters
        inputParameter.forEach((input, index) => {
            const edge = new TypeEdge(functionType, input.type, INPUT_PARAMETER);
            this.enforceName(input.name, this.options.enforceInputParameterNames);
            edge.properties.set(PARAMETER_NAME, input.name);
            edge.properties.set(PARAMETER_ORDER, index);
            this.typir.graph.addEdge(edge);
        });

        // register inference rules for the new function
        if (inferenceRuleForDeclaration) {
            this.typir.inference.addInferenceRule({
                isRuleApplicable(domainElement) {
                    if (inferenceRuleForDeclaration(domainElement)) {
                        return functionType;
                    } else {
                        return 'RULE_NOT_APPLICABLE';
                    }
                },
            });
        }
        if (inferenceRuleForCalls) {
            const typirr: Typir = this.typir;
            this.typir.inference.addInferenceRule({
                isRuleApplicable(domainElement) {
                    if (outputParameter?.type === undefined) {
                        // special case: the current function has no output type/parameter at all! => this function does not provide any type, when it is called
                        return 'RULE_NOT_APPLICABLE';
                    }
                    const result = inferenceRuleForCalls(domainElement);
                    if (result === true) {
                        // the function type is already identifed, no need to check values for parameters
                        return outputParameter.type; // this case occurs only, if the current function has an output type/parameter!
                    } else if (result === false) {
                        // does not match at all
                        return 'RULE_NOT_APPLICABLE';
                    } else if (Array.isArray(result)) {
                        // this function type might match, to be sure, resolve the types of the values for the parameters and continue to step 2
                        return result;
                    } else {
                        assertUnreachable(result);
                    }
                },
                inferType(domainElement, childrenTypes) {
                    const inputTypes = inputParameter.map(p => p.type);
                    // all operands need to be assignable(! not equal) to the required types
                    const comparisonConflicts = compareTypes(childrenTypes, inputTypes,
                        (t1, t2) => typirr.assignability.isAssignable(t1, t2), 'ASSIGNABLE_TYPE');
                    if (comparisonConflicts.length >= 1) {
                        // this function type does not match, due to assignability conflicts => return them as errors
                        return [{
                            domainElement,
                            inferenceCandidate: functionType,
                            location: 'input parameters',
                            rule: this,
                            inferenceConflicts: comparisonConflicts,
                        }];
                    } else {
                        // matching => return the return type of the function for the case of a function call!
                        return outputParameter!.type; // this case occurs only, if the current function has an output type/parameter!
                    }
                },
            });
        }

        return functionType;
    }

    getUserRepresentation(type: Type): string {
        return this.printFunctionType(this.getSimpleFunctionName(type), this.getInputs(type), this.getOutput(type));
    }

    protected printFunctionType(simpleFunctionName: string, inputs: NameTypePair[], output: NameTypePair | undefined): string {
        const inputsString = inputs.map(input => this.printNameType(input)).join(', ');
        const outputString = output?.type.getUserRepresentation();
        if (this.hasName(simpleFunctionName)) {
            const outputValue = outputString ? `: ${outputString}` : '';
            return `${simpleFunctionName}(${inputsString})${outputValue}`;
        } else {
            return `(${inputsString}) => ${outputString ?? '()'}`;
        }
    }

    protected printNameType(pair: NameTypePair): string {
        if (this.hasName(pair.name)) {
            return `${pair.name}: ${pair.type.getUserRepresentation()}`;
        } else {
            return pair.type.getUserRepresentation();
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

    isSubType(superType: Type, subType: Type): TypeConflict[] {
        if (isFunctionKind(superType.kind) && isFunctionKind(subType.kind)) {
            const conflicts: TypeConflict[] = [];
            // output: target parameter must be assignable to source parameter
            conflicts.push(...compareNameTypePair(superType.kind.getOutput(superType), subType.kind.getOutput(subType),
                this.options.enforceOutputParameterName, (s, t) => this.typir.assignability.isAssignable(t, s), 'ASSIGNABLE_TYPE'));
            // input: source parameters must be assignable to target parameters
            conflicts.push(...compareNameTypePairs(superType.kind.getInputs(superType), subType.kind.getInputs(subType),
                this.options.enforceInputParameterNames, (s, t) => this.typir.assignability.isAssignable(s, t), 'ASSIGNABLE_TYPE'));
            return conflicts;
        }
        throw new Error();
    }

    areTypesEqual(type1: Type, type2: Type): TypeConflict[] {
        if (isFunctionKind(type1.kind) && isFunctionKind(type2.kind)) {
            const conflicts: TypeConflict[] = [];
            // same name? TODO is this correct??
            if (this.options.enforceFunctionName) {
                conflicts.push(...compareForConflict(type1.kind.getSimpleFunctionName(type1), type2.kind.getSimpleFunctionName(type2), 'simple name', 'EQUAL_TYPE'));
            }
            // same output?
            conflicts.push(...compareNameTypePair(type1.kind.getOutput(type1), type2.kind.getOutput(type2),
                this.options.enforceOutputParameterName, (s, t) => this.typir.equality.areTypesEqual(s, t), 'EQUAL_TYPE'));
            // same input?
            conflicts.push(...compareNameTypePairs(type2.kind.getInputs(type1), type2.kind.getInputs(type2),
                this.options.enforceInputParameterNames, (s, t) => this.typir.equality.areTypesEqual(s, t), 'EQUAL_TYPE'));
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
