import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";
const config = [
  { ignores: [".next/**", "node_modules/**", "public/**", ".qa/**"] },
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    rules: { "@next/next/no-img-element": "off" },
  },
  {
    files: ["scripts/**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
];
export default config;
