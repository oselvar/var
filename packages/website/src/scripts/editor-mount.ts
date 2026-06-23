import { EditorView, basicSetup } from 'codemirror'
import { markdown } from '@codemirror/lang-markdown'

export function mountEditor(el: HTMLElement): EditorView {
  const doc = el.dataset.doc ?? ''
  const view = new EditorView({
    doc,
    extensions: [basicSetup, markdown()],
    parent: el,
  })
  return view
}

function mountAll(): void {
  for (const el of document.querySelectorAll<HTMLElement>('.cm-mount')) {
    if (el.dataset.mounted) continue
    el.dataset.mounted = 'true'
    mountEditor(el)
  }
}

mountAll()
