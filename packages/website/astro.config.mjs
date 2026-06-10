import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://oselvar.github.io',
  base: '/bdd',
  output: 'static',
  trailingSlash: 'ignore',
})
