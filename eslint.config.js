import js from '@eslint/js';
import pluginTypescriptEslint from '@typescript-eslint/eslint-plugin';
import pluginUnusedImports from 'eslint-plugin-unused-imports';
import stylistic from '@stylistic/eslint-plugin';
import tseslint from 'typescript-eslint';

// Replaces the unmaintained `eslint-plugin-header`, which is stuck on the eslintrc API.
const HEADER_PATTERN = /MIT License|DO NOT EDIT MANUALLY!/;
const pluginTypir = {
    rules: {
        header: {
            meta: {
                type: 'layout',
                schema: [],
                messages: {
                    incorrectHeader: 'Missing or incorrect file header, expected a leading block comment matching {{pattern}}.'
                }
            },
            create(context) {
                return {
                    Program(node) {
                        const { sourceCode } = context;
                        const text = sourceCode.getText();
                        // A shebang line is allowed to precede the header comment
                        const headerStart = text.startsWith('#!') ? text.indexOf('\n') + 1 : 0;
                        const comment = sourceCode.getAllComments().find(c => c.range[0] >= headerStart);
                        const isHeader = comment
                            && comment.type === 'Block'
                            && text.slice(headerStart, comment.range[0]).trim().length === 0
                            && HEADER_PATTERN.test(comment.value);
                        if (!isHeader) {
                            context.report({
                                loc: comment?.loc ?? node.loc,
                                messageId: 'incorrectHeader',
                                data: { pattern: String(HEADER_PATTERN) }
                            });
                        }
                    }
                };
            }
        }
    }
};

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
            '@typescript-eslint': pluginTypescriptEslint,
            'unused-imports': pluginUnusedImports,
            '@stylistic': stylistic,
            typir: pluginTypir,
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
            // Use MIT file header
            'typir/header': 'error',
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
