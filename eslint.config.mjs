import { defineConfig } from "eslint/config";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import header from "eslint-plugin-header";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all,
});

export default defineConfig([
    {
        ignores: [
            "**/\\{node_modules,lib,bin}",
            "**/*.js",
            "**/*.cjs",
            "packages/typir/lib/**",
            "packages/typir-langium/lib/**",
            "examples/lox/src/language/generated/**",
            "examples/ox/src/language/generated/**",
            "examples/lox/out/**",
            "examples/ox/out/**",
        ],
    },
    {
        files: ["**/*.ts"],
        extends: compat.extends(
            "eslint:recommended",
            "plugin:@typescript-eslint/recommended",
        ),

        plugins: {
            "@typescript-eslint": typescriptEslint,
            header,
        },

        languageOptions: {
            parser: tsParser,
            ecmaVersion: 2017,
            sourceType: "module",
        },

        rules: {
            "arrow-parens": ["off", "as-needed"],
            "constructor-super": "error",
            "dot-notation": "error",
            eqeqeq: "error",
            "guard-for-in": "error",
            "new-parens": "error",
            "no-bitwise": "error",
            "no-caller": "error",
            "no-cond-assign": "error",
            "no-debugger": "error",
            "no-eval": "error",
            "no-inner-declarations": "off",
            "no-labels": "error",

            "no-multiple-empty-lines": [
                "error",
                {
                    max: 3,
                },
            ],

            "no-new-wrappers": "error",
            "no-throw-literal": "error",
            "no-trailing-spaces": "error",
            "no-unsafe-finally": "error",
            "no-var": "error",

            semi: [2, "always"],

            quotes: [
                2,
                "double",
                {
                    avoidEscape: true,
                },
            ],

            "use-isnan": "error",

            // "header/header": [2, "block", {
            //     pattern: "MIT License|DO NOT EDIT MANUALLY!",
            // }],

            "@typescript-eslint/adjacent-overload-signatures": "error",

            "@typescript-eslint/array-type": [
                "error",
                {
                    default: "array-simple",
                },
            ],

            "@typescript-eslint/no-empty-object-type": "off",
            "@typescript-eslint/no-inferrable-types": "off",
            "@typescript-eslint/no-misused-new": "error",
            "@typescript-eslint/no-namespace": "off",
            "@typescript-eslint/no-non-null-assertion": "off",
            "@typescript-eslint/parameter-properties": "error",

            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    argsIgnorePattern: "^_",
                },
            ],

            "@typescript-eslint/no-var-requires": "error",
            "@typescript-eslint/prefer-for-of": "error",
            "@typescript-eslint/prefer-namespace-keyword": "error",
            "@typescript-eslint/triple-slash-reference": "error",
        },
    },
]);
