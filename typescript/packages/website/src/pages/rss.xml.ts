import { getCollection } from 'astro:content'
import rss from '@astrojs/rss'
import type { APIContext } from 'astro'

export async function GET(context: APIContext) {
  const posts = (await getCollection('blog', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
  )
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  return rss({
    title: 'Vár blog',
    description: 'Notes on Behaviour-Driven Development, executable specs, and Vár.',
    // The deployed origin (astro.config `site`); links are joined onto it.
    site: context.site ?? 'https://oselvar.github.io',
    items: posts.map((p) => ({
      title: p.data.title,
      description: p.data.description,
      pubDate: p.data.pubDate,
      // Include the base path so the absolute URL is correct under /var.
      link: `${base}/blog/${p.id}/`,
    })),
  })
}
