/**
 * Tabby's light scheme paints glyphs in #4d4d4c. On a canvas or WebGL atlas those
 * gray stems never fill a device pixel, so the text looks soft next to GTK.
 * A light foreground needs a contrast ratio of at least this before we leave it.
 */
const LIGHT_INK_CONTRAST = 12

/** Linux Tabby default. A face the user picked is left alone. */
const REPLACEABLE_DEFAULT_FONTS = new Set(['Liberation Mono'])

export const SOLID_LIGHT_INK = '#000000'

export interface Rgb {
  r: number
  g: number
  b: number
  a: number
}

export function parseCssColor(input?: string | null): Rgb | null {
  if (!input) return null
  const color = input.trim().toLowerCase()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(color)
  if (hex) {
    const raw = hex[1]
    const expand = (byte: string) => parseInt(byte.length === 1 ? byte + byte : byte, 16)
    if (raw.length === 3) {
      return { r: expand(raw[0]), g: expand(raw[1]), b: expand(raw[2]), a: 1 }
    }
    return {
      r: expand(raw.slice(0, 2)),
      g: expand(raw.slice(2, 4)),
      b: expand(raw.slice(4, 6)),
      a: raw.length === 8 ? expand(raw.slice(6, 8)) / 255 : 1,
    }
  }
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/.exec(color)
  if (!rgb) return null
  return {
    r: Number(rgb[1]),
    g: Number(rgb[2]),
    b: Number(rgb[3]),
    a: rgb[4] === undefined ? 1 : Number(rgb[4]),
  }
}

function linearChannel(value: number): number {
  const channel = value / 255
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(color: Rgb): number {
  return 0.2126 * linearChannel(color.r) + 0.7152 * linearChannel(color.g) + 0.0722 * linearChannel(color.b)
}

export function contrastRatio(foreground: Rgb, background: Rgb): number {
  const lighter = relativeLuminance(foreground)
  const darker = relativeLuminance(background)
  const [hi, lo] = lighter >= darker ? [lighter, darker] : [darker, lighter]
  return (hi + 0.05) / (lo + 0.05)
}

/** Light-background gray ink. Dark themes and already-solid ink return false. */
export function needsSolidInk(foreground?: string | null, background?: string | null): boolean {
  const fg = parseCssColor(foreground)
  const bg = parseCssColor(background)
  if (!fg || !bg || bg.a < 0.95 || relativeLuminance(bg) < 0.6) return false
  if (fg.a < 0.9) return true
  return contrastRatio(fg, bg) < LIGHT_INK_CONTRAST
}

export function solidifyLightTheme<T extends { foreground?: string; background?: string; cursor?: string; cursorAccent?: string }>(
  theme: T | null | undefined
): T | null {
  if (!theme || !needsSolidInk(theme.foreground, theme.background)) return null
  const next = { ...theme, foreground: SOLID_LIGHT_INK }
  if (!theme.cursor || theme.cursor.toLowerCase() === (theme.foreground || '').toLowerCase()) {
    next.cursor = SOLID_LIGHT_INK
  }
  if (!next.cursorAccent && theme.background) next.cursorAccent = theme.background
  return next
}

/** gsettings prints "'Consolas 12'". */
export function parseDesktopMonospace(raw?: string | null): string | null {
  if (!raw) return null
  const text = raw.trim().replace(/^['"]|['"]$/g, '')
  const match = /^(.*?)(?:\s+(\d+(?:\.\d+)?))?$/.exec(text)
  const family = match?.[1]?.trim()
  return family || null
}

/**
 * Replace only Tabby's untouched Linux default. Returns the raw family Tabby
 * stores in config.terminal.font, not a CSS font-family list.
 */
export function replacementFontFamily(configuredRaw?: string | null, desktop?: string | null): string | null {
  const first = (configuredRaw || '').split(',')[0].replace(/["']/g, '').trim()
  const face = desktop?.trim()
  if (!face || !REPLACEABLE_DEFAULT_FONTS.has(first) || first === face) return null
  return face
}

/** fontSize * devicePixelRatio should be a whole device pixel. */
export function snapFontSize(fontSize: number, devicePixelRatio: number): number {
  if (!(fontSize > 0) || !(devicePixelRatio > 0)) return fontSize
  const device = fontSize * devicePixelRatio
  const rounded = Math.round(device)
  if (Math.abs(device - rounded) < 0.05) return fontSize
  return Math.round((rounded / devicePixelRatio) * 1000) / 1000
}

/** CSS pixels to add so origin * devicePixelRatio lands on an integer. */
export function devicePixelDelta(origin: number, devicePixelRatio: number): number {
  if (!(devicePixelRatio > 0) || !Number.isFinite(origin)) return 0
  const delta = Math.round(origin * devicePixelRatio) / devicePixelRatio - origin
  if (Math.abs(delta) < 0.01) return 0
  return Math.round(delta * 1000) / 1000
}
