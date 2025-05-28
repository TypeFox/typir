/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type } from "../../graph/type-node.js";
import { isConversionEdge } from "../../services/conversion.js";
import {
    CompositeTypeInferenceRule,
    InferenceProblem,
} from "../../services/inference.js";
import { isSubTypeEdge } from "../../services/subtype.js";
import { assertUnreachable } from "../../utils/utils.js";
import { FunctionCallInferenceRule } from "./function-inference-call.js";

/**
 * Custom inference rule for functions, which consists of one inference rule for each overload/signature for a function with same name.
 * Each of these inference rules is an instance of `FunctionCallInferenceRule`.
 *
 * When deadling with multiple inference rules, usually the first successful inference rule is applied and following inference rules are ignored.
 * In order to deal with multiple matching inference rules for overloaded functions,
 * all available inference rules need to be executed and all successful inference rules need to be collected.
 */
export class OverloadedFunctionsTypeInferenceRule<
    LanguageType,
> extends CompositeTypeInferenceRule<LanguageType> {
    protected override inferTypeLogic(
        languageNode: LanguageType,
    ): Type | Array<InferenceProblem<LanguageType>> {
        this.checkForError(languageNode);

        // check all rules in order to search for the best-matching rule, not for the first-matching rule
        const matchingOverloads: Array<OverloadedMatch<LanguageType>> = [];
        const collectedInferenceProblems: Array<
            InferenceProblem<LanguageType>
        > = [];
        // execute the rules which are associated to the key of the current language node
        const languageKey =
            this.services.Language.getLanguageNodeKey(languageNode);
        for (const rule of this.ruleRegistry.getRulesByLanguageKey(
            languageKey,
        )) {
            const result = this.executeSingleInferenceRuleLogic(
                rule,
                languageNode,
                collectedInferenceProblems,
            );
            if (result) {
                matchingOverloads.push({
                    result,
                    rule: rule as FunctionCallInferenceRule<LanguageType>,
                });
            } else {
                // no result for this inference rule => check the next inference rules
            }
        }
        // execute all rules which are associated to no language nodes at all (as a fall-back for such rules)
        if (languageKey !== undefined) {
            for (const rule of this.ruleRegistry.getRulesByLanguageKey(
                undefined,
            )) {
                const result = this.executeSingleInferenceRuleLogic(
                    rule,
                    languageNode,
                    collectedInferenceProblems,
                );
                if (result) {
                    matchingOverloads.push({
                        result,
                        rule: rule as FunctionCallInferenceRule<LanguageType>,
                    });
                } else {
                    // no result for this inference rule => check the next inference rules
                }
            }
        }

        if (matchingOverloads.length <= 0) {
            // no matches => return all the collected inference problems
            if (collectedInferenceProblems.length <= 0) {
                // document the reason, why neither a type nor inference problems are found
                collectedInferenceProblems.push({
                    $problem: InferenceProblem,
                    languageNode: languageNode,
                    location: "found no applicable inference rules",
                    subProblems: [],
                });
            }
            return collectedInferenceProblems;
        } else if (matchingOverloads.length === 1) {
            // single match
            return matchingOverloads[0].result;
        } else {
            // multiple matches => determine the one to return

            // 1. identify and collect the best matches
            const bestMatches: Array<OverloadedMatch<LanguageType>> = [
                matchingOverloads[0],
            ];
            for (let i = 1; i < matchingOverloads.length; i++) {
                const currentMatch = matchingOverloads[i];
                const comparison = this.compareMatchingOverloads(
                    bestMatches[0],
                    currentMatch,
                );
                if (comparison < 0) {
                    // the existing matches are better than the current one => keep the existing best matches
                } else if (comparison > 0) {
                    // the current match is better than the already collect ones => replace the existing best matches by the current one
                    bestMatches.splice(0, bestMatches.length, currentMatch);
                } else {
                    // the current and the existing matches are both good => collect both
                    bestMatches.push(currentMatch);
                }
            }

            // 2. evaluate the remaining best matches
            if (bestMatches.length === 0) {
                // return the single remaining match
                return bestMatches[0].result;
            } else {
                // decide how to deal with multiple best matches
                const result = this.handleMultipleBestMatches(bestMatches);
                if (result) {
                    // return the chosen match
                    return result.result;
                } else {
                    // no decision => inference is not possible
                    return [
                        {
                            $problem: InferenceProblem,
                            languageNode: languageNode,
                            location: `Found ${bestMatches.length} best matching overloads: ${bestMatches.map((m) => m.result.getIdentifier()).join(", ")}`,
                            subProblems: [], // there are no real sub-problems, since the relevant overloads match ...
                        },
                    ];
                }
            }
        }
    }

    protected handleMultipleBestMatches(
        matchingOverloads: Array<OverloadedMatch<LanguageType>>,
    ): OverloadedMatch<LanguageType> | undefined {
        return matchingOverloads[0]; // by default, return the 1st best match
    }

    // better matches are at the beginning of the list, i.e. better matches get values lower than zero
    protected compareMatchingOverloads(
        match1: OverloadedMatch<LanguageType>,
        match2: OverloadedMatch<LanguageType>,
    ): number {
        const cost1 = this.calculateCost(match1);
        const cost2 = this.calculateCost(match2);
        return cost1 === cost2 ? 0 : cost1 < cost2 ? -1 : +1;
    }

    protected calculateCost(match: OverloadedMatch<LanguageType>): number {
        return (
            match.rule.assignabilitySuccess // one path (consisting of an arbitrary number of edges) for each parameter
                .flatMap((s) => s?.path ?? []) // collect all conversion/sub-type edges which are required to map actual types to the expected types of the parameters
                // equal types (i.e. an empty path) are better than sub-types, sub-types are better than conversions
                .map(
                    (edge) =>
                        (isSubTypeEdge(edge)
                            ? 1
                            : isConversionEdge(edge)
                              ? 2
                              : assertUnreachable(edge)) as number,
                )
                .reduce((l, r) => l + r, 0)
        ); // sum of all costs
    }
}

interface OverloadedMatch<LanguageType> {
    result: Type;
    rule: FunctionCallInferenceRule<LanguageType>;
}
