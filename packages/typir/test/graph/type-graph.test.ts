/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { describe, expect, test } from 'vitest';
import { TestingSpecifics } from '../../src/test/predefined-language-nodes.js';
import { createTypirServices } from '../../src/typir.js';

describe('Find edges in the type graph', () => {
    const typir = createTypirServices<TestingSpecifics>();
    const graph = typir.infrastructure.Graph;
    const a = typir.factory.Primitives.create({ primitiveName: 'A' }).finish();
    const b = typir.factory.Primitives.create({ primitiveName: 'B' }).finish();
    const $relation = 'MyRelation'; // note that the same edge might be interpreted to be unidirectional or bidirectional
    graph.addEdge({ $relation, from: a, to: b, cachingInformation: 'LINK_EXISTS' });

    test('Find bidirectional edges: the order of given types does not matter', async () => {
        const found1 = graph.getBidirectionalEdge(a, b, $relation);
        const found2 = graph.getBidirectionalEdge(b, a, $relation);
        expect(found1).toBeTruthy();
        expect(found2).toBeTruthy();
        expect(found1).toBe(found2);
    });

    test('Find unidirectional edges: the order of given types does matter', async () => {
        const found1 = graph.getUnidirectionalEdge(a, b, $relation);
        const found2 = graph.getUnidirectionalEdge(b, a, $relation);
        expect(found1).toBeTruthy();
        expect(found2).toBe(undefined);
    });
});
