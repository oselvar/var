// @ts-check

import { fileURLToPath } from 'node:url'
import sitemap from '@astrojs/sitemap'
import starlight from '@astrojs/starlight'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'
import starlightLlmsTxt from 'starlight-llms-txt'
import languages from '../../../languages.json' with { type: 'json' }

// The repo root: pages ?raw-import the language-neutral example specs from
// doc/examples/, which sits above the typescript/ workspace (Vite's default
// fs.allow boundary), so the dev server must be allowed to read it.
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))

// The non-default language ids (everything but the attribute-less TypeScript
// default), derived from the shared languages.json so the restore script below
// can never drift from the header dropdown.
const nonDefaultLangs = languages.map((l) => l.id).filter((id) => id !== 'ts')

// Re-apply stored choices before first paint (the defaults — TypeScript, Jord
// palette, STIX prose, JetBrains code — are attribute-less; only a non-default
// choice needs marking). The palette/font selects are dev-only design tools
// (see src/components/ThemeSelect.astro), so production restores only the
// language and always renders the default appearance.
const restoreLang = `var l=localStorage.getItem('var-lang');if(${nonDefaultLangs
  .map((id) => `l==='${id}'`)
  .join('||')})d.lang=l;`
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
  site: 'https://varar.dev',
  integrations: [
    restorePrefs(),
    sitemap(),
    starlight({
      title: 'Varar',
      tableOfContents: true,
      plugins: [
        // Generate /llms.txt (a curated index) and /llms-full.txt (every doc
        // page concatenated as clean Markdown) at build time. Agents are a
        // first-class audience for these docs; this gives them a single URL to
        // fetch the whole corpus instead of scraping rendered HTML.
        starlightLlmsTxt({
          projectName: 'Varar',
          description:
            'Varar turns Markdown documents into executable tests: the prose IS ' +
            'the source of truth. Steps are matched to two role functions — ' +
            'stimulus (arrange/act) and sensor (assert) — never to Given/When/Then ' +
            'keywords. A sensor returns a value and the pure core compares it ' +
            'against what the Markdown says, failing with span-anchored diffs. ' +
            'One language-neutral spec corpus runs across every port (TypeScript, ' +
            'Python, Java, Kotlin, Ruby, Rust, .NET, Go) via test-framework adapters.',
        }),
      ],
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
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/varar-dev/varar' }],
      sidebar: [
        {
          label: 'Start here',
          items: ['tutorials/try-var', 'tutorials/get-started', 'tutorials/first-spec'],
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
            'reference/stimuli',
            'reference/sensors',
            'reference/custom-parameters',
            'reference/editor-support',
            'reference/example-projects',
          ],
        },
        {
          label: 'Understanding Varar',
          items: [
            'explanation/oaths',
            'explanation/test-anatomy',
            'explanation/thin-steps',
            'explanation/markup-is-yours',
            'explanation/var-for-cucumber-users',
          ],
        },
      ],
      editLink: {
        baseUrl: 'https://github.com/varar-dev/varar/edit/main/typescript/packages/website/',
      },
    }),
  ],

  vite: {
    plugins: [tailwindcss()],
    server: { fs: { allow: [repoRoot] } },
  },
})
