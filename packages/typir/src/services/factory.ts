/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
******************************************************************************/

import { TypeInitializer } from '../initialization/type-initializer.js';
import { CreateFunctionTypeDetails, FunctionKind } from '../kinds/function/function-kind.js';
import { FunctionType } from '../kinds/function/function-type.js';
import { PrimitiveKind, PrimitiveTypeDetails } from '../kinds/primitive/primitive-kind.js';
import { PrimitiveType } from '../kinds/primitive/primitive-type.js';
import { TypirServices } from '../typir.js';
import { OperatorManager } from './operator.js';

export interface FactoryService {
    primitives: PrimitiveFactoryService;
    functions: FunctionPredefinedService;
    operators: OperatorManager;
}

export interface PrimitiveFactoryService {
    create(typeDetails: PrimitiveTypeDetails): PrimitiveType;
    get(typeDetails: PrimitiveTypeDetails): PrimitiveType | undefined;
    // getKind(): PrimitiveKind; // erstmal nicht rausreichen
}

export class DefaultPrimitivePredefinedService implements PrimitiveFactoryService {
    protected primitiveKind: PrimitiveKind;

    constructor(services: TypirServices) {
        this.initializePrimitives(services);
    }

    protected initializePrimitives(services: TypirServices): void {
        this.primitiveKind = new PrimitiveKind(services);
    }

    create(typeDetails: PrimitiveTypeDetails): PrimitiveType {
        return this.primitiveKind.create(typeDetails);
    }

    get(typeDetails: PrimitiveTypeDetails): PrimitiveType | undefined {
        return this.primitiveKind.get(typeDetails);
    }
}

export interface FunctionPredefinedService {
    create(typeDetails: CreateFunctionTypeDetails<unknown>): TypeInitializer<FunctionType>;
}


export class DefaultPredefinedService implements FactoryService {
    protected readonly services: TypirServices;

    primitives: PrimitiveFactoryService;
    functions: FunctionPredefinedService;
    operators: OperatorManager;

    constructor(services: TypirServices) {
        this.services = services;

        // primitives
        this.initializePrimitives();

        // functions
        const functionKind = new FunctionKind(this.services);
        this.functions = {
            create: (typeDetails: CreateFunctionTypeDetails<unknown>) => functionKind.create(typeDetails),
        };

        this.operators = services.operators;
    }

    protected initializePrimitives(): void {
        this.primitives = new DefaultPrimitivePredefinedService(this.services);
    }

}
