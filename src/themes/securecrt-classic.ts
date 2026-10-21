import { Injectable } from '@angular/core'
import { TerminalColorSchemeProvider, TerminalColorScheme } from 'tabby-terminal'

/** Tabby 1.0.163 的公开配色类型不含这两项，xterm 主题仍会读取它们。 */
export interface WorkbenchTerminalColorScheme extends TerminalColorScheme {
  cursorAccent?: string
  selection?: string
}

/**
 * Ptyxis (Default GNOME / Fedora Ptyxis dark burgundy palette)
 */
export const PTYXIS_SCHEME: WorkbenchTerminalColorScheme = {
  name: 'Ptyxis',
  foreground: '#ffffff',
  background: '#300a24',
  cursor: '#ffffff',
  cursorAccent: '#300a24',
  selection: '#5c2b53',
  colors: [
    '#171421', // black
    '#c01c28', // red
    '#26a269', // green
    '#a2734c', // yellow
    '#12488b', // blue
    '#a347ba', // magenta
    '#2aa1b3', // cyan
    '#d0cfcc', // white
    '#5e5c64', // bright black
    '#f66151', // bright red
    '#33d17a', // bright green
    '#e9ad0c', // bright yellow
    '#2a7bde', // bright blue
    '#c061cb', // bright magenta
    '#33c7de', // bright cyan
    '#ffffff', // bright white
  ],
}

/**
 * SecureCRT System Color Scheme (Classic Windows/System warm light palette)
 */
export const SECURECRT_SYSTEM_SCHEME: WorkbenchTerminalColorScheme = {
  name: 'SecureCRT System Color Scheme',
  foreground: '#000000',
  background: '#faf8ec',
  cursor: '#000000',
  cursorAccent: '#faf8ec',
  selection: '#b5d5ff',
  colors: [
    '#000000', // black
    '#800000', // red
    '#008000', // green
    '#808000', // yellow
    '#000080', // blue
    '#800080', // magenta
    '#008080', // cyan
    '#c0c0c0', // white
    '#808080', // bright black
    '#ff0000', // bright red
    '#00ff00', // bright green
    '#ffff00', // bright yellow
    '#0000ff', // bright blue
    '#ff00ff', // bright magenta
    '#00ffff', // bright cyan
    '#ffffff', // bright white
  ],
}

/**
 * SecureCRT Classic (Black background, bright green cursor)
 */
export const SECURECRT_CLASSIC_SCHEME: WorkbenchTerminalColorScheme = {
  name: 'SecureCRT Classic',
  foreground: '#c0c0c0',
  background: '#000000',
  cursor: '#00ff00',
  cursorAccent: '#000000',
  selection: '#444444',
  colors: [
    '#000000', // black
    '#bb0000', // red
    '#00bb00', // green
    '#bbbb00', // yellow
    '#0000bb', // blue
    '#bb00bb', // magenta
    '#00bbbb', // cyan
    '#bbbbbb', // white
    '#555555', // bright black
    '#ff5555', // bright red
    '#55ff55', // bright green
    '#ffff55', // bright yellow
    '#5555ff', // bright blue
    '#ff55ff', // bright magenta
    '#55ffff', // bright cyan
    '#ffffff', // bright white
  ],
}

export const WORKBENCH_DEFAULT_CUSTOM_SCHEMES: WorkbenchTerminalColorScheme[] = [
  SECURECRT_SYSTEM_SCHEME,
  PTYXIS_SCHEME,
  SECURECRT_CLASSIC_SCHEME,
]

@Injectable()
export class SecureCrtColorSchemeProvider extends TerminalColorSchemeProvider {
  async getSchemes(): Promise<TerminalColorScheme[]> {
    return WORKBENCH_DEFAULT_CUSTOM_SCHEMES
  }
}

export const COLOR_NAMES = [
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite',
]

export function resolveColorScheme(
  name?: string,
  extraSchemes: WorkbenchTerminalColorScheme[] = []
): WorkbenchTerminalColorScheme {
  if (!name) return SECURECRT_SYSTEM_SCHEME
  const all = [...extraSchemes, ...WORKBENCH_DEFAULT_CUSTOM_SCHEMES]
  const match = all.find((s) => s.name?.toLowerCase() === name.toLowerCase())
  return match || SECURECRT_SYSTEM_SCHEME
}

export function applyColorSchemeToTab(tab: any, scheme: WorkbenchTerminalColorScheme): void {
  if (!tab || !scheme) return

  const theme: Record<string, string> = {
    foreground: scheme.foreground,
    selection: scheme.selection || '#88888888',
    background: scheme.background,
    cursor: scheme.cursor,
    cursorAccent: scheme.cursorAccent || scheme.background,
  }

  for (let i = 0; i < COLOR_NAMES.length; i++) {
    if (scheme.colors && scheme.colors[i]) {
      theme[COLOR_NAMES[i]] = scheme.colors[i]
    }
  }

  try {
    if (tab.frontend?.xterm?.options) {
      tab.frontend.xterm.options.theme = theme
    }
    const hostEl = tab.element?.nativeElement
    if (hostEl) {
      hostEl.style.backgroundColor = scheme.background
    }
  } catch (err) {
    console.warn('[Workbench] Error applying color scheme to tab', err)
  }
}

