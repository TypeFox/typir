/* eslint-disable header/header */
import { Type, TypeEdge } from '../graph/type-graph';
import { Typir } from '../main';
import { NameTypePair, compareNameTypePair, compareNameTypePairs } from '../utils';
import { Kind, isKind } from './kind';

/**
 * Represents signatures of executable code.
 *
 * possible Extensions:
 * - multiple output parameters
 * - create variants of this, e.g. functions, procedures, lambdas
 */
export class FunctionKind extends Kind {
    readonly $type: 'FunctionKind';

    constructor(typir: Typir) {
        super(typir);
    }

    createFunctionType(functionName: string,
        outputParameter: NameTypePair | undefined, ...inputParameter: NameTypePair[]): Type {
        // the order of parameters is important!

        // create the function type
        const functionType = new Type(this, functionName);
        this.typir.graph.addNode(functionType);

        // output parameter
        if (outputParameter) {
            const edge = new TypeEdge(functionType, outputParameter.type, OUTPUT_PARAMETER);
            edge.properties.set(PARAMETER_NAME, outputParameter.name);
            this.typir.graph.addEdge(edge);
        }

        // input parameters
        inputParameter.forEach((input, index) => {
            const edge = new TypeEdge(functionType, input.type, INPUT_PARAMETER);
            edge.properties.set(PARAMETER_NAME, input.name);
            edge.properties.set(PARAMETER_ORDER, index);
            this.typir.graph.addEdge(edge);
        });

        return functionType;
    }

    override getUserRepresentation(type: Type): string {
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

    protected hasName(name: string | undefined): name is string {
        return name !== undefined && name !== FUNCTION_MISSING_NAME;
    }

    override isAssignable(source: Type, target: Type): boolean {
        if (isFunctionKind(source) && isFunctionKind(target)) {
            // output: target parameter must be assignable to source parameter
            if (compareNameTypePair(this.getOutput(source), this.getOutput(target),
                (s, t) => this.typir.assignability.isAssignable(t, s)) === false) {
                return false;
            }

            // input: source parameters must be assignable to target parameters
            if (compareNameTypePairs(this.getInputs(source), this.getInputs(target),
                (s, t) => this.typir.assignability.isAssignable(s, t)) === false) {
                return false;
            }

            // match of signatures!
            return true;
        }
        return false;
    }

    override areTypesEqual(type1: Type, type2: Type): boolean {
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
    return isKind(kind) && kind.$type === 'FunctionKind';
}
