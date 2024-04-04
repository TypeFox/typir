/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeEdge } from '../graph/type-edge.js';
import { Type } from '../graph/type-node.js';
import { Typir } from '../typir.js';
import { NameTypePair, compareNameTypePair, compareNameTypePairs } from '../utils.js';
import { Kind, isKind } from './kind.js';

export interface FunctionKindOptions {
    enforceFunctionName: boolean,
    enforceInputParameterNames: boolean,
    enforceOutputParameterName: boolean,
}

export const FunctionKindName = 'FunctionKind';

/**
 * Represents signatures of executable code.
 *
 * possible Extensions:
 * - multiple output parameters
 * - create variants of this, e.g. functions, procedures, lambdas
 */
export class FunctionKind implements Kind {
    readonly $name: 'FunctionKind';
    readonly typir: Typir;
    readonly options: FunctionKindOptions;

    constructor(typir: Typir, options?: Partial<FunctionKindOptions>) {
        this.typir = typir;
        this.typir.registerKind(this);
        this.options = {
            enforceFunctionName: false,
            enforceInputParameterNames: false,
            enforceOutputParameterName: false,
            ...options
        };
    }

    createFunctionType(functionName: string,
        outputParameter: NameTypePair | undefined,
        ...inputParameter: NameTypePair[]): Type {
        // the order of parameters is important!

        // create the function type
        this.enforceName(functionName, this.options.enforceFunctionName);
        const functionType = new Type(this, functionName);
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

        return functionType;
    }

    getUserRepresentation(type: Type): string {
        const inputs = this.getInputs(type).map(input => this.printNameType(input)).join(', ');
        const outputType = this.getOutput(type)?.type.getUserRepresentation();
        if (this.hasName(type.name)) {
            const output = outputType ? `: ${outputType}` : '';
            return `${type.name}(${inputs})${output}`;
        } else {
            return `(${inputs}) => ${outputType ?? '()'}`;
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

    isSubType(superType: Type, subType: Type): boolean {
        if (isFunctionKind(superType) && isFunctionKind(subType)) {
            // output: target parameter must be assignable to source parameter
            if (compareNameTypePair(this.getOutput(superType), this.getOutput(subType),
                (s, t) => this.typir.assignability.isAssignable(t, s)) === false) {
                return false;
            }

            // input: source parameters must be assignable to target parameters
            if (compareNameTypePairs(this.getInputs(superType), this.getInputs(subType),
                (s, t) => this.typir.assignability.isAssignable(s, t)) === false) {
                return false;
            }

            // match of signatures!
            return true;
        }
        return false;
    }

    areTypesEqual(type1: Type, type2: Type): boolean {
        if (isFunctionKind(type1) && isFunctionKind(type2)) {
            // same output?
            if (compareNameTypePair(this.getOutput(type1), this.getOutput(type2),
                (s, t) => this.typir.equality.areTypesEqual(s, t)) === false) {
                return false;
            }
            // same input?
            if (compareNameTypePairs(this.getInputs(type1), this.getInputs(type2),
                (s, t) => this.typir.equality.areTypesEqual(s, t)) === false) {
                return false;
            }
            return true; // yes!
        }
        return false;
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

export function isFunctionKind(kind: unknown): kind is FunctionKind {
    return isKind(kind) && kind.$name === FunctionKindName;
}
