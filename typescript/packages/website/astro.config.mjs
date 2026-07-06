// @ts-check

import { fileURLToPath } from 'node:url'
import starlight from '@astrojs/starlight'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

// The repo root: pages ?raw-import the language-neutral example specs from
// doc/examples/, which sits above the typescript/ workspace (Vite's default
// fs.allow boundary), so the dev server must be allowed to read it.
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))

// Re-apply stored choices before first paint (the defaults — TypeScript, Jord
// palette, STIX prose, JetBrains code — are attribute-less; only a non-default
// choice needs marking). The palette/font selects are dev-only design tools
// (see src/components/ThemeSelect.astro), so production restores only the
// language and always renders the default appearance.
const restoreLang =
  "var l=localStorage.getItem('var-lang');if(l==='java'||l==='kotlin'||l==='python')d.lang=l;"
const restoreAppearance =
  "var p=localStorage.getItem('var-palette');if(p==='fjord'||p==='ild'||p==='fjeld')d.palette=p;if(localStorage.getItem('var-font-prose')==='atkinson')d.fontProse='atkinson';if(localStorage.getItem('var-font-code')==='atkinson')d.fontCode='atkinson';"

/** @returns {import('astro').AstroIntegration} */
const restorePrefs = () => ({
  name: 'var-restore-prefs',
  hooks: {
    'astro:config:setup': ({ command, injectScript }) => {
      const body = command === 'dev' ? restoreLang + restoreAppearance : restoreLang
      injectScript('head-inline', `try{var d=document.documentElement.dataset;${body}}catch(e){}`)
    },
  },
})

// https://astro.build/config
export default defineConfig({
  site: 'https://var.oselvar.com',
  integrations: [
    restorePrefs(),
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
          items: [
            'reference/examples',
            'reference/stimulus',
            'reference/sensors',
            'reference/custom-parameters',
            'reference/example-projects',
          ],
        },
        {
          label: 'Understanding Vár',
          items: [
            'explanation/given-when-then',
            'explanation/thin-steps',
            'explanation/var-for-cucumber-users',
          ],
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
