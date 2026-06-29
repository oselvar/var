import { describe, expect, it } from 'vitest'
import { decodeEntities } from './step-highlight.js'

describe('decodeEntities', () => {
  it('reverses the entities Astro emits', () => {
    expect(decodeEntities('a &amp; b &lt;c&gt; &quot;q&quot; &#39;x&#39; &#34;y&#34;')).toBe(
      'a & b <c> "q" \'x\' "y"',
    )
  })
})
