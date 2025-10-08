/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { AnalyzeEqualityOptions, Type, isType } from '../../graph/type-node.js';
import { TypeReference } from '../../initialization/type-reference.js';
import { TypeEqualityProblem } from '../../services/equality.js';
import { TypirSpecifics } from '../../typir.js';
import { NameTypePair, TypirProblem } from '../../utils/utils-definitions.js';
import { checkTypeArrays, checkTypes, checkValueForConflict, createKindConflict, createTypeCheckStrategy } from '../../utils/utils-type-comparison.js';
import { assertUnreachable } from '../../utils/utils.js';
import { FunctionKind, FunctionTypeDetails, isFunctionKind } from './function-kind.js';

export interface ParameterDetails {
    readonly name: string;
    readonly type: TypeReference<Type>;
}

export class FunctionType extends Type {
    override readonly kind: FunctionKind<TypirSpecifics>;

    readonly functionName: string;
    readonly outputParameter: ParameterDetails | undefined;
    readonly inputParameters: ParameterDetails[];

    constructor(kind: FunctionKind<TypirSpecifics>, typeDetails: FunctionTypeDetails<TypirSpecifics>) {
        super(undefined, typeDetails);
        this.kind = kind;
        this.functionName = typeDetails.functionName;

        // output parameter
        this.outputParameter = this.createOutputParameter(typeDetails);

        // input parameters
        this.inputParameters = this.createInputParameters(typeDetails);

        // define to wait for the parameter types
        const allParameterRefs = this.inputParameters.map(p => p.type);
        if (this.outputParameter) {
            allParameterRefs.push(this.outputParameter.type);
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

    private createOutputParameter(typeDetails: FunctionTypeDetails<TypirSpecifics>): ParameterDetails | undefined {
        if (typeDetails.outputParameter) {
            const outputType = new TypeReference(typeDetails.outputParameter.type, this.kind.services);
            this.kind.enforceParameterName(typeDetails.outputParameter.name, this.kind.options.enforceOutputParameterName);
            this.kind.services.infrastructure.RelationshipUpdater.markUseAsRelevantForEquality(this, outputType);
            return {
                name: typeDetails.outputParameter.name,
                type: outputType,
            };
        } else {
            return undefined;
        }
    }

    private createInputParameters(typeDetails: FunctionTypeDetails<TypirSpecifics>): ParameterDetails[] {
        return typeDetails.inputParameters.map(input => {
            this.kind.enforceParameterName(input.name, this.kind.options.enforceInputParameterNames);
            const typeRef = new TypeReference(input.type, this.kind.services);
            this.kind.services.infrastructure.RelationshipUpdater.markUseAsRelevantForEquality(this, typeRef);
            return <ParameterDetails>{
                name: input.name,
                type: typeRef,
            };
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

    override analyzeTypeEquality(otherType: Type, options?: AnalyzeEqualityOptions): boolean | TypirProblem[] {
        if (isFunctionType(otherType)) {
            const conflicts: TypirProblem[] = [];
            // same name? since functions with different names are different
            if (this.kind.options.enforceFunctionName) {
                conflicts.push(...checkValueForConflict(this.getSimpleFunctionName(), otherType.getSimpleFunctionName(), 'simple name'));
                if (conflicts.length >= 1 && options?.failFast) { return conflicts; }
            }
            // same output?
            conflicts.push(...checkTypes(this.getOutput(), otherType.getOutput(),
                (s, t) => this.kind.services.Equality.getTypeEqualityProblem(s, t), this.kind.options.enforceOutputParameterName));
            if (conflicts.length >= 1 && options?.failFast) { return conflicts; }
            // same input?
            conflicts.push(...checkTypeArrays(this.getInputs(), otherType.getInputs(),
                (s, t) => this.kind.services.Equality.getTypeEqualityProblem(s, t), this.kind.options.enforceInputParameterNames, !!options?.failFast));
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

    protected analyzeSubTypeProblems(subType: FunctionType, superType: FunctionType): TypirProblem[] {
        const conflicts: TypirProblem[] = [];
        const strategy = createTypeCheckStrategy(this.kind.options.subtypeParameterChecking, this.kind.services);
        // output: sub type output must be assignable (which can be configured) to super type output
        conflicts.push(...checkTypes(subType.getOutput(), superType.getOutput(),
            (sub, superr) => strategy(sub, superr), this.kind.options.enforceOutputParameterName));
        // input: super type inputs must be assignable (which can be configured) to sub type inputs
        conflicts.push(...checkTypeArrays(subType.getInputs(), superType.getInputs(),
            (sub, superr) => strategy(superr, sub), this.kind.options.enforceInputParameterNames, false));
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
