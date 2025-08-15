/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { beforeAll, describe, test } from 'vitest';
import { createTypirServicesForTesting, integer123, IntegerLiteral, StatementBlock, TestExpressionNode, TestingSpecifics } from '../../src/test/predefined-language-nodes.js';
import { TypirServices } from '../../src/typir.js';
import { expectValidationIssues, expectValidationIssuesAbsent, expectValidationIssuesNone, expectValidationIssuesStrict } from '../../src/test/test-utils.js';

describe('Test cases for the "expectValidationIssues*(...)" test utilities', () => {
    let typir: TypirServices<TestingSpecifics>;

    beforeAll(() => {
        typir = createTypirServicesForTesting();
        typir.validation.Collector.addValidationRule((node, accept) => {
            if (node instanceof TestExpressionNode) {
                accept({ languageNode: node, severity: 'error', message: 'found Expression'});
            }
            if (node instanceof IntegerLiteral) {
                accept({ languageNode: node, severity: 'error', message: 'found Integer literal'});
            }
        });
    });

    test('some issues (some of the actual issues are expected)', () => {
        expectValidationIssues(typir, integer123, ['found Integer literal']); // "found Expression" is ignored here
    });
    test('some issues (all of the actual issues are expected)', () => {
        expectValidationIssues(typir, integer123, ['found Integer literal', 'found Expression']);
    });
    test('some issues (none of the actual issues are expected)', () => {
        expectValidationIssues(typir, integer123, []);
    });
    test.fails('some issues (fails, since an issue is expected, but does not occur)', () => {
        expectValidationIssues(typir, integer123, ['found Integer literal', 'found WhatEverNode']);
    });

    test('strict (all of the actual issues are expected)', () => {
        expectValidationIssuesStrict(typir, integer123, ['found Integer literal', 'found Expression']);
    });
    test('strict (all of the actual issues are expected: errors)', () => {
        expectValidationIssuesStrict(typir, integer123, { severity: 'error' }, ['found Integer literal', 'found Expression']);
    });
    test('strict (all of the actual issues are expected: warnings)', () => {
        expectValidationIssuesStrict(typir, integer123, { severity: 'warning' }, []);
    });
    test.fails('strict (fails: too less)', () => {
        expectValidationIssuesStrict(typir, integer123, ['found Integer literal']);
    });
    test.fails('strict (fails: too much)', () => {
        expectValidationIssuesStrict(typir, integer123, ['found Integer literal', 'found Expression', 'found WhatEverNode']);
    });

    test('absent (only a absent issue)', () => {
        expectValidationIssuesAbsent(typir, integer123, ['found WhatEverNode']);
    });
    test.fails('absent (fails, since the given issue occurs)', () => {
        expectValidationIssuesAbsent(typir, integer123, ['found Expression']);
    });
    test('absent (the specified issue occurs as error, not as warning)', () => {
        expectValidationIssuesAbsent(typir, integer123, { severity: 'warning' }, ['found Expression']);
    });
    test('absent (works even for an empty array)', () => {
        expectValidationIssuesAbsent(typir, integer123, []);
    });

    test('none (at all)', () => {
        expectValidationIssuesNone(typir, new StatementBlock([]));
    });
    test('none warnings', () => {
        expectValidationIssuesNone(typir, integer123, { severity: 'warning' });
    });
    test.fails('none errors fails, since there are error issues', () => {
        expectValidationIssuesNone(typir, integer123, { severity: 'error' });
    });

});
