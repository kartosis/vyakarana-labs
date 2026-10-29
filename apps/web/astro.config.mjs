// @ts-check
import { defineConfig } from "astro/config";
import preact from "@astrojs/preact";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: process.env.SITE_URL ?? "https://sanskrit.identifyragas.com",
  output: "static",
  trailingSlash: "always",
  build: { format: "directory", inlineStylesheets: "auto" },
  integrations: [preact({ compat: false }), mdx(), sitemap()],
  vite: {
    // The engine package ships TypeScript source.
    ssr: { noExternal: ["@vl/engine"] },
  },
});
