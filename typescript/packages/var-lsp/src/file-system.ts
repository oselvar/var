import type { VarGlobs } from '@oselvar/var-config'

export interface FileSystem {
  list(globs: VarGlobs): Promise<string[]>
  read(path: string): Promise<string>
  write(path: string, content: string): Promise<void>
  // Whether a path matches the given globs (include minus exclude). Used to
  // recognise spec docs that may not be on disk yet (unsaved editor buffers),
  // which `list` — being disk-backed — cannot see.
  matches(path: string, globs: VarGlobs): boolean
}
