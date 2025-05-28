/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type, isType } from '../../graph/type-node.js';
import { TypeReference } from '../../initialization/type-reference.js';
import { TypeEqualityProblem } from '../../services/equality.js';
import type {
    NameTypePair,
    TypirProblem,
} from '../../utils/utils-definitions.js';
import {
    checkTypeArrays,
    checkTypes,
    checkValueForConflict,
    createKindConflict,
    createTypeCheckStrategy,
} from '../../utils/utils-type-comparison.js';
import { assertTrue, assertUnreachable } from '../../utils/utils.js';
import type { FunctionKind, FunctionTypeDetails } from './function-kind.js';
import { isFunctionKind } from './function-kind.js';

export interface ParameterDetails {
    name: string;
    type: TypeReference<Type>;
}

export class FunctionType extends Type {
    override readonly kind: FunctionKind<unknown>;

    readonly functionName: string;
    readonly outputParameter: ParameterDetails | undefined;
    readonly inputParameters: ParameterDetails[];

    constructor(
        kind: FunctionKind<unknown>,
        typeDetails: FunctionTypeDetails<unknown>,
    ) {
        super(undefined, typeDetails);
        this.kind = kind;
        this.functionName = typeDetails.functionName;

        // output parameter
        const outputType = typeDetails.outputParameter
            ? new TypeReference(
                typeDetails.outputParameter.type,
                this.kind.services,
            )
            : undefined;
        if (typeDetails.outputParameter) {
            assertTrue(outputType !== undefined);
            this.kind.enforceParameterName(
                typeDetails.outputParameter.name,
                this.kind.options.enforceOutputParameterName,
            );
            this.outputParameter = {
                name: typeDetails.outputParameter.name,
                type: outputType,
            };
        } else {
            // no output parameter
            this.outputParameter = undefined;
        }

        // input parameters
        this.inputParameters = typeDetails.inputParameters.map((input) => {
            this.kind.enforceParameterName(
                input.name,
                this.kind.options.enforceInputParameterNames,
            );
            return <ParameterDetails>{
                name: input.name,
                type: new TypeReference(input.type, this.kind.services),
            };
        });

        // define to wait for the parameter types
        const allParameterRefs = this.inputParameters.map((p) => p.type);
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
        const inputsString = inputs
            .map((input) => this.kind.getParameterRepresentation(input))
            .join(', ');
        // output
        const output = this.getOutput();
        const outputString = output
            ? this.kind.hasParameterName(output.name)
                ? `(${this.kind.getParameterRepresentation(output)})`
                : output.type.getName()
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
                conflicts.push(
                    ...checkValueForConflict(
                        this.getSimpleFunctionName(),
                        otherType.getSimpleFunctionName(),
                        'simple name',
                    ),
                );
            }
            // same output?
            conflicts.push(
                ...checkTypes(
                    this.getOutput(),
                    otherType.getOutput(),
                    (s, t) =>
                        this.kind.services.Equality.getTypeEqualityProblem(
                            s,
                            t,
                        ),
                    this.kind.options.enforceOutputParameterName,
                ),
            );
            // same input?
            conflicts.push(
                ...checkTypeArrays(
                    this.getInputs(),
                    otherType.getInputs(),
                    (s, t) =>
                        this.kind.services.Equality.getTypeEqualityProblem(
                            s,
                            t,
                        ),
                    this.kind.options.enforceInputParameterNames,
                ),
            );
            return conflicts;
        } else {
            return [
                <TypeEqualityProblem>{
                    $problem: TypeEqualityProblem,
                    type1: this,
                    type2: otherType,
                    subProblems: [createKindConflict(otherType, this)],
                },
            ];
        }
    }

    protected analyzeSubTypeProblems(
        subType: FunctionType,
        superType: FunctionType,
    ): TypirProblem[] {
        const conflicts: TypirProblem[] = [];
        const strategy = createTypeCheckStrategy(
            this.kind.options.subtypeParameterChecking,
            this.kind.services,
        );
        // output: sub type output must be assignable (which can be configured) to super type output
        conflicts.push(
            ...checkTypes(
                subType.getOutput(),
                superType.getOutput(),
                (sub, superr) => strategy(sub, superr),
                this.kind.options.enforceOutputParameterName,
            ),
        );
        // input: super type inputs must be assignable (which can be configured) to sub type inputs
        conflicts.push(
            ...checkTypeArrays(
                subType.getInputs(),
                superType.getInputs(),
                (sub, superr) => strategy(superr, sub),
                this.kind.options.enforceInputParameterNames,
            ),
        );
        return conflicts;
    }

    getSimpleFunctionName(): string {
        return this.functionName;
    }

    getOutput(
        notResolvedBehavior: 'EXCEPTION' | 'RETURN_UNDEFINED' = 'EXCEPTION',
    ): NameTypePair | undefined {
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
                        throw new Error(
                            `Output parameter ${this.outputParameter.name} is not resolved.`,
                        );
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
        return this.inputParameters.map((param) => {
            const type = param.type.getType();
            if (type) {
                return <NameTypePair>{
                    name: param.name,
                    type,
                };
            } else {
                throw new Error(
                    `Input parameter ${param.name} is not resolved.`,
                );
            }
        });
    }
}

export function isFunctionType(type: unknown): type is FunctionType {
    return isType(type) && isFunctionKind(type.kind);
}
