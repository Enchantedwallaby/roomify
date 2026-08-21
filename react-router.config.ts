import type { Config } from "@react-router/dev/config";

export default {
  // Roomify is a client-side application. Keeping SSR disabled lets Netlify
  // deploy the generated client bundle without requiring a Node server.
  ssr: false,
} satisfies Config;
