import mdx from '@astrojs/mdx'
import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://oselvar.github.io',
  base: '/var',
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [mdx()],
})
