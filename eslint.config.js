import js from '@eslint/js';
import { fixupPluginRules } from '@eslint/compat';
import stylistic from '@stylistic/eslint-plugin';
import header from 'eslint-plugin-header';
import tseslint from 'typescript-eslint';

const headerPlugin = fixupPluginRules(header);
headerPlugin.rules.header.meta = { ...headerPlugin.rules.header.meta, schema: [{ type: 'string' }, {}, {}] };

export default [
    { ignores: ['**/node_modules/', '**/lib/', '**/bin/', '**/*.js'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['**/*.ts'],
        languageOptions: {
            ecmaVersion: 2017,
            sourceType: 'module',
        },
        plugins: {
            '@stylistic': stylistic,
            header: headerPlugin,
        },
        rules: {
            'arrow-parens': ['off', 'as-needed'],
            'constructor-super': 'error',
            'dot-notation': 'error',
            eqeqeq: 'error',
            'guard-for-in': 'error',
            'new-parens': 'error',
            'no-bitwise': 'error',
            'no-caller': 'error',
            'no-cond-assign': 'error',
            'no-debugger': 'error',
            'no-eval': 'error',
            'no-inner-declarations': 'off',
            'no-labels': 'error',
            'no-new-wrappers': 'error',
            'no-throw-literal': 'error',
            'no-unsafe-finally': 'error',
            'no-var': 'error',
            'use-isnan': 'error',
            '@stylistic/indent': 'error',
            '@stylistic/no-multiple-empty-lines': ['error', { max: 3 }],
            '@stylistic/no-trailing-spaces': 'error',
            '@stylistic/space-before-function-paren': ['error', {
                anonymous: 'never',
                asyncArrow: 'always',
                named: 'never',
            }],
            semi: ['error', 'always'],
            '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
            '@stylistic/type-annotation-spacing': 'error',
            'header/header': ['error', 'block', { pattern: 'MIT License|DO NOT EDIT MANUALLY!' }],
            '@typescript-eslint/adjacent-overload-signatures': 'error',
            '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
            '@typescript-eslint/no-empty-object-type': ['error', { allowInterfaces: 'with-single-extends' }],
            '@typescript-eslint/no-inferrable-types': 'off',
            '@typescript-eslint/no-misused-new': 'error',
            '@typescript-eslint/no-namespace': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off',
            '@typescript-eslint/parameter-properties': 'off',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/no-require-imports': 'error',
            '@typescript-eslint/prefer-for-of': 'error',
            '@typescript-eslint/prefer-namespace-keyword': 'error',
            '@typescript-eslint/triple-slash-reference': 'error',
        },
    },
];
