/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Type, TypeStateListener } from '../../graph/type-node.js';
import { TypeInitializer } from '../../initialization/type-initializer.js';
import { TypeInferenceRule } from '../../services/inference.js';
import { TypirServices, TypirSpecifics } from '../../typir.js';
import { bindInferCurrentTypeRule, InferenceRuleWithOptions, optionsBoundToType, skipInferenceRuleForExistingType } from '../../utils/utils-definitions.js';
import { areTypesEqualUtility, areTypesSubTypesUtility } from '../../utils/utils-type-comparison.js';
import { assertTypirType } from '../../utils/utils.js';
import { FunctionCallInferenceRule } from './function-inference-call.js';
import { CreateFunctionTypeDetails, FunctionKind, FunctionTypeDetails, InferFunctionCall } from './function-kind.js';
import { AvailableFunctionsManager } from './function-overloading.js';
import { FunctionType, isFunctionType } from './function-type.js';

/**
 * For each call of FunctionKind.create()...finish(), one instance of this class will be created,
 * which at some point in time returns a new or an existing FunctionType.
 *
 * If the function type to create already exists, the given inference rules (and its validation rules) will be registered for the existing function type.
 */
export class FunctionTypeInitializer<Specifics extends TypirSpecifics> extends TypeInitializer<FunctionType, Specifics> implements TypeStateListener {
    protected readonly typeDetails: CreateFunctionTypeDetails<Specifics>;
    protected readonly functions: AvailableFunctionsManager<Specifics>;
    protected readonly initialFunctionType: FunctionType;

    protected inferenceForCall: Array<InferenceRuleWithOptions<Specifics>> = [];
    protected inferenceForDeclaration: Array<InferenceRuleWithOptions<Specifics>> = [];

    constructor(services: TypirServices<Specifics>, kind: FunctionKind<Specifics>, typeDetails: CreateFunctionTypeDetails<Specifics>) {
        super(services);
        this.typeDetails = typeDetails;
        this.functions = kind.functions;

        const functionName = typeDetails.functionName;

        // check the input
        if (typeDetails.outputParameter === undefined && typeDetails.inferenceRulesForCalls.length >= 1) {
            // no output parameter => no inference rule for calling this function
            throw new Error(`A function '${functionName}' without output parameter cannot have an inferred type, when this function is called!`);
        }
        kind.enforceFunctionName(functionName, kind.options.enforceFunctionName);

        // create the new Function type
        this.initialFunctionType = new FunctionType(kind as unknown as FunctionKind<TypirSpecifics>, typeDetails as unknown as FunctionTypeDetails<TypirSpecifics>);

        this.createRules(this.initialFunctionType);
        this.registerRules(functionName, undefined);

        this.initialFunctionType.addListener(this, true);
    }

    override getTypeInitial(): FunctionType {
        return this.initialFunctionType;
    }

    onSwitchedToIdentifiable(functionType: Type): void {
        const functionName = this.typeDetails.functionName;
        assertTypirType(functionType, isFunctionType);
        const readyFunctionType = this.producedType(functionType);
        if (readyFunctionType !== functionType) {
            functionType.removeListener(this);
            this.deregisterRules(functionName, undefined);
            this.createRules(readyFunctionType);
            this.registerRules(functionName, readyFunctionType);
        } else {
            this.deregisterRules(functionName, undefined);
            this.registerRules(functionName, readyFunctionType);
        }

        // find equal functions, due to properties with types which have equal types
        (this.functions.getOverloads(readyFunctionType.getName())?.overloadedFunctions ?? []) // check only the existing functions with same name, since all others are not equal for sure
            .filter(other => other !== readyFunctionType && areTypesEqualUtility(readyFunctionType, other))
            .forEach(other => this.services.Equality.markAsEqual(readyFunctionType, other));
        // find functions which are sub-types to each other
        for (const other of (this.functions.getOverloads(readyFunctionType.getName())?.overloadedFunctions ?? [])) { // check only the existing functions with same name, since all others are no sub-types to each other for sure
            if (other === readyFunctionType) {
                continue;
            }
            if (areTypesSubTypesUtility(readyFunctionType, other)) {
                this.services.Subtype.markAsSubType(readyFunctionType, other);
            }
            if (areTypesSubTypesUtility(other, readyFunctionType)) {
                this.services.Subtype.markAsSubType(other, readyFunctionType);
            }
        }

        // TODO react on equality changes
        // - generische Checks vs alle Members überprüfen?
        // - wer/wo wird auf Änderungen reagiert?
        //   - jeder Type macht es selbst
        //   - im FunctionManager realisieren, um auf weniger Updates reagieren zu müssen?
        //   - ein Manager für alle/beliebige Typen? ist nachteilig, weil dann spezifische Optimierungen schwierig werden (z.B. können nur Funktionen mit gleichem Namen gleich sein!)
        // Scenarios
        // - add Equality edge: are more depending types equal as well
        // - remove Equality edge: remove equality of depending types
        // - add type: equal to existing types?? eigentlich nur spezifisch pro Kind lösen, weil ein neuer Type noch nicht verwendet werden kann (?) und noch keine Equality-Edges hat
        // - remove type: vorher werden alle bestehenden Equality-Edges entfernt => dort schon reagieren
        // Performance (es bleibt aber quadratischer Aufwand; wenn auch halbiert, weil Equality symmetrisch ist)
        // - Notifications mit mehreren Edges/Nodes aufeinmal?
        // - neue/removed Edges sammeln und auf einen Schlag übergeben
        // - Folge-Updates sammeln und für nächste Notifications übergeben/merken/sammeln => in eigene Komponente auslagern, wird sehr komplex! + slice()-Problematik
        // oder doch Link zwischen Funktion und Parameter-Typen im TypeGraph ablegen, um Rückverfolgung für bessere Performanz hinzubekommen??
        // - zusätzliche Kanten anlegen ("use" gerichtet) vs. Kanten zur Realisierung nutzen?
        // - nur alle direkten "use"rs müssen auf Equality überprüft werden (Vorsicht mit zirkulären "use"-Beziehungen!)
        //   - alle Users of Type A mit allen Users of Type B vergleichen?
        //   - oder alle Users der Typen A & B mit allen existierenden Typen vergleichen?
        // - dann könnte diese Logik sogar zentral und einmal im Equality-Service realisiert werden?!
        // Gilt der ganze Update-Spaß eigentlich auch für Sub-Type-Berechnungen??

        // There is no need to remove the skipped type, since it is not yet added here, since the new type is skipped in favor of the already existing (and added) type!
        this.functions.addFunction(readyFunctionType, this.typeDetails.inferenceRulesForCalls);
    }

    onSwitchedToCompleted(functionType: Type): void {
        functionType.removeListener(this);
    }

    onSwitchedToInvalid(_functionType: Type): void {
        // nothing specific needs to be done for Functions here, since the base implementation takes already care about all relevant stuff
    }

    protected registerRules(functionName: string, functionType: FunctionType | undefined): void {
        for (const rule of this.inferenceForCall) {
            const overloaded = this.functions.getOrCreateOverloads(functionName);
            overloaded.inferenceRule.addInferenceRule(rule.rule, optionsBoundToType(rule.options, functionType));
        }
        for (const rule of this.inferenceForDeclaration) {
            this.services.Inference.addInferenceRule(rule.rule, optionsBoundToType(rule.options, functionType));
        }
    }

    protected deregisterRules(functionName: string, functionType: FunctionType | undefined): void {
        for (const rule of this.inferenceForCall) {
            const overloaded = this.functions.getOverloads(functionName);
            overloaded?.inferenceRule.removeInferenceRule(rule.rule, optionsBoundToType(rule.options, functionType));
        }
        for (const rule of this.inferenceForDeclaration) {
            this.services.Inference.removeInferenceRule(rule.rule, optionsBoundToType(rule.options, functionType));
        }
    }

    protected createRules(functionType: FunctionType): void {
        // clear the current list ...
        this.inferenceForCall.splice(0, this.inferenceForCall.length);
        this.inferenceForDeclaration.splice(0, this.inferenceForDeclaration.length);

        // ... and recreate all rules
        for (const inferenceRuleForCall of this.typeDetails.inferenceRulesForCalls) {
            if (skipInferenceRuleForExistingType(inferenceRuleForCall, this.initialFunctionType, functionType)) {
                continue;
            }
            // create inference rule for calls of the new function
            this.inferenceForCall.push({
                rule: this.createFunctionCallInferenceRule(inferenceRuleForCall, functionType),
                options: {
                    languageKey: inferenceRuleForCall.languageKey,
                    // boundToType: ... this property will be specified outside of this method, when this rule is registered
                },
            });
        }

        // create inference rule for the declaration of the new function
        // (regarding overloaded function, for now, it is assumed, that the given inference rule itself is concrete enough to handle overloaded functions itself!)
        for (const inferenceRuleForDeclaration of this.typeDetails.inferenceRulesForDeclaration) {
            if (skipInferenceRuleForExistingType(inferenceRuleForDeclaration, this.initialFunctionType, functionType)) {
                continue;
            }
            this.inferenceForDeclaration.push(bindInferCurrentTypeRule(inferenceRuleForDeclaration, functionType));
        }
    }

    protected createFunctionCallInferenceRule(rule: InferFunctionCall<Specifics>, functionType: FunctionType): TypeInferenceRule<Specifics> {
        return new FunctionCallInferenceRule<Specifics>(this.typeDetails, rule, functionType, this.functions);
    }
}
