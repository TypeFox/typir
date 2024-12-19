/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Kind } from '../kinds/kind.js';
import { TypirServices } from '../typir.js';

export interface KindRegistry {
    register(kind: Kind): void;
    get<T extends Kind>(type: T['$name']): T | undefined;
    getOrCreateKind<T extends Kind>(type: T['$name'], factory: (services: TypirServices) => T): T;
}

export class DefaultKindRegistry implements KindRegistry {
    protected readonly services: TypirServices;
    protected readonly kinds: Map<string, Kind> = new Map(); // name of kind => kind (for an easier look-up)

    constructor(services: TypirServices) {
        this.services = services;
    }

    register(kind: Kind): void {
        const key = kind.$name;
        if (this.kinds.has(key)) {
            if (this.kinds.get(key) === kind) {
                // that is OK
            } else {
                throw new Error(`duplicate kind named '${key}'`);
            }
        } else {
            this.kinds.set(key, kind);
        }
    }

    get<T extends Kind>(type: T['$name']): T | undefined {
        return this.kinds.get(type) as (T | undefined);
    }

    getOrCreateKind<T extends Kind>(type: T['$name'], factory: (services: TypirServices) => T): T {
        const existing = this.get(type);
        if (existing) {
            return existing;
        }
        return factory(this.services);
    }
}
