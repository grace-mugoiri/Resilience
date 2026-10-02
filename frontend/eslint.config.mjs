import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // This prototype fetches data with plain useEffect + useState across
      // ~20 pages (no React Query/SWR/Suspense data layer was introduced —
      // see ARCHITECTURE.md). That's exactly the pattern this newer
      // react-compiler-era rule flags. Adopting a Suspense-based data
      // fetching approach everywhere is a real architectural change, not a
      // hackathon-scope fix, so this is downgraded to a warning rather than
      // rewritten wholesale.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
