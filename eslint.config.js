import js from "@eslint/js"
import tseslint from "typescript-eslint"

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    rules: {
      /* The SDK infers callback types from a generic schema this code cannot
         resolve at the call site, so one `never` cast is deliberate and
         confined to src/tools/shared.ts. */
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
)
