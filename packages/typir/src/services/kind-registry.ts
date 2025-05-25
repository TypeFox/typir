/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Kind } from '../kinds/kind.js';
import { TypirServices } from '../typir.js';

export interface KindRegistry<LanguageType> {
    register(kind: Kind): void;
    get<T extends Kind>($name: string): T | undefined;
    getOrCreateKind<T extends Kind>($name: string, factory: (services: TypirServices<LanguageType>) => T): T;
}

export class DefaultKindRegistry<LanguageType> implements KindRegistry<LanguageType> {
    protected readonly services: TypirServices<LanguageType>;
    protected readonly kinds: Map<string, Kind> = new Map(); // name of kind => kind (for an easier look-up)

    constructor(services: TypirServices<LanguageType>) {
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

    get<T extends Kind>($name: string): T | undefined {
        return this.kinds.get($name) as (T | undefined);
    }

    getOrCreateKind<T extends Kind>($name: string, factory: (services: TypirServices<LanguageType>) => T): T {
        const existing = this.get($name);
        if (existing) {
            return existing as T;
        }
        return factory(this.services);
    }
}
