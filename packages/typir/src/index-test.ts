/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

// export all utilities which are using 'vitest' and which are not located in test/ */ but in src/ here
// to be imported via 'typir/test' in order not to mix up production code with 'vitest' dependencies

export * from './utils/test-utils.js';
