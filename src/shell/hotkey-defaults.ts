export const SESSION_SEARCH_HOTKEY_ID = 'workbench-focus-search'
export const SESSION_SEARCH_STROKE = 'Alt-C'

/**
 * Returns the default binding for session search.
 * If another command already owns Alt-C, the workbench binding stays empty
 * so the existing hotkey is not overwritten.
 */
export function resolveSearchHotkeyDefault(
  hotkeys: Record<string, string[] | undefined> | null | undefined
): string[] {
  const table = hotkeys || {}
  for (const [id, strokes] of Object.entries(table)) {
    if (id === SESSION_SEARCH_HOTKEY_ID) continue
    if (Array.isArray(strokes) && strokes.includes(SESSION_SEARCH_STROKE)) {
      return []
    }
  }
  return [SESSION_SEARCH_STROKE]
}
