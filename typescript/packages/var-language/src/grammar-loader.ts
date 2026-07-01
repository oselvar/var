export interface GrammarLoader {
  load(languageId: string): Promise<Uint8Array>
}
