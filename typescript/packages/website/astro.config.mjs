// @ts-check

import { fileURLToPath } from 'node:url'
import starlight from '@astrojs/starlight'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

// The repo root: pages ?raw-import the language-neutral example specs from
// doc/examples/, which sits above the typescript/ workspace (Vite's default
// fs.allow boundary), so the dev server must be allowed to read it.
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))

// https://astro.build/config
export default defineConfig({
  site: 'https://var.oselvar.com',
  integrations: [
    starlight({
      title: 'Vár',
      customCss: [
        './src/styles/tailwind.css',
        './src/styles/custom.css',
        './src/styles/themes/fjord.css',
        './src/styles/themes/ild.css',
        './src/styles/themes/fjeld.css',
      ],
      components: {
        ThemeSelect: './src/components/ThemeSelect.astro',
      },
      head: [
        {
          // Apply the stored palette and font choices before first paint (the
          // defaults — Jord palette, STIX prose, JetBrains code — are
          // attribute-less; only a non-default choice needs marking).
          tag: 'script',
          content:
            "try{var d=document.documentElement.dataset;var p=localStorage.getItem('var-palette');if(p==='fjord'||p==='ild'||p==='fjeld')d.palette=p;if(localStorage.getItem('var-font-prose')==='atkinson')d.fontProse='atkinson';if(localStorage.getItem('var-font-code')==='atkinson')d.fontCode='atkinson'}catch(e){}",
        },
      ],
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/oselvar/var' }],
      sidebar: [
        {
          label: 'Start here',
          items: ['tutorials/try-in-browser', 'tutorials/get-started', 'tutorials/first-spec'],
        },
        {
          label: 'How-to guides',
          items: [
            'how-to/tables-and-doc-strings',
            'how-to/run-with-vitest',
            'how-to/agent-instructions',
            'how-to/drive-a-feature-with-an-agent',
          ],
        },
        {
          label: 'Reference',
          items: ['reference/stimulus', 'reference/sensors'],
        },
        {
          label: 'Understanding Vár',
          items: ['explanation/thin-steps', 'explanation/var-for-cucumber-users'],
        },
      ],
      editLink: {
        baseUrl: 'https://github.com/oselvar/var/edit/main/typescript/packages/website/',
      },
    }),
  ],

  vite: {
    plugins: [tailwindcss()],
    server: { fs: { allow: [repoRoot] } },
  },
})
