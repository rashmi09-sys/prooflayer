import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: [".next/**", "node_modules/**", ".data/**", "fixtures/**", "demo/recorded/**", "next-env.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { process: "readonly", console: "readonly", Buffer: "readonly", URL: "readonly", fetch: "readonly", setTimeout: "readonly", clearTimeout: "readonly", setInterval: "readonly", clearInterval: "readonly", crypto: "readonly", AbortSignal: "readonly", Response: "readonly", window: "readonly", document: "readonly", navigator: "readonly", NodeJS: "readonly" } } },
);
