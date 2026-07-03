import mdx from "@astrojs/mdx";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import pagefind from "astro-pagefind";
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: "https://oselvar.github.io",
  base: "/var",
  output: "static",
  trailingSlash: "ignore",
  integrations: [
    mdx(),
    pagefind(),
    starlight({
      title: "Docs With Edit Links",
      editLink: {
        baseUrl: "https://github.com/oselvar/var/edit/main/typescript/packages/website-starlight/docs/",
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
