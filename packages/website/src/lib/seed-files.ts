export const SEED_FILES: Record<string, string> = {
  '/hello.var.md': `# Hello, Vár\n\nFirst I greet "world" okay? I think the greeting should be "Hello, world!"\n`,
  '/01-hello.steps.ts': `import { defineContext } from '@oselvar/var-runtime'

const { step } = defineContext(() => ({ greeting: '' }))

step('I greet {string}', (ctx, name) => {
  ctx.greeting = \`Hello, \${name}!\`
})

step('the greeting should be {string}', (ctx, expected) => {
  if (ctx.greeting !== expected) {
    throw new Error(\`expected the greeting to be "\${expected}" but it was "\${ctx.greeting}"\`)
  }
})
`,
}
