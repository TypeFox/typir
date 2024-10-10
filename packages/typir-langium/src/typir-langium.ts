/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Module, TypirServices, PartialTypirServices } from 'typir';
import { LangiumProblemPrinter } from './features/langium-printing.js';

/**
 * Contains all customizations of Typir to simplify type checking for DSLs developed with Langium,
 * the language workbench for textual domain-specific languages (DSLs) in the web (https://langium.org/).
 */
export const TypirLangiumModule: Module<TypirServices, PartialTypirServices> = {
    printer: () => new LangiumProblemPrinter(),
};
