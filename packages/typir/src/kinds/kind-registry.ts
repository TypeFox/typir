/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Kind } from './kind.js';

export interface KindRegistry {
    register(kind: Kind): void;
    get(type: string): Kind | undefined;
}

export class DefaultKindRegistry implements KindRegistry {
    // name of kind => kind (for an easier look-up)
    protected readonly kinds: Map<string, Kind> = new Map();

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

    get(type: string): Kind | undefined {
        return this.kinds.get(type)!;
    }
}
