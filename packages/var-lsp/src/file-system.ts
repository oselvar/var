export interface FileSystem {
  list(globs: readonly string[]): Promise<string[]>
  read(path: string): Promise<string>
  write(path: string, content: string): Promise<void>
  // Whether a path matches the given globs (positive globs minus `!`-excludes).
  // Used to recognise spec docs that may not be on disk yet (unsaved editor
  // buffers), which `list` — being disk-backed — cannot see.
  matches(path: string, globs: readonly string[]): boolean
}
