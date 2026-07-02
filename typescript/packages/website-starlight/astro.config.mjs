// @ts-check

import starlight from '@astrojs/starlight'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

// https://astro.build/config
export default defineConfig({
  site: 'https://var.oselvar.com',
  integrations: [
    starlight({
      title: 'Vár',
      customCss: ['./src/styles/tailwind.css', './src/styles/custom.css'],
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
          label: 'Understanding Vár',
          items: ['explanation/thin-steps', 'explanation/var-for-cucumber-users'],
        },
      ],
    }),
  ],

  vite: {
    plugins: [tailwindcss()],
  },
})
