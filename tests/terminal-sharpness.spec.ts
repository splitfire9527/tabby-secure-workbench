import {
  devicePixelDelta,
  needsSolidInk,
  parseDesktopMonospace,
  replacementFontFamily,
  snapFontSize,
  SOLID_LIGHT_INK,
  solidifyLightTheme,
} from '../src/shell/terminal-sharpness'

describe('terminal sharpness', () => {
  it('treats Tabby Default Light gray on white as washed ink', () => {
    expect(needsSolidInk('#4d4d4c', '#ffffff')).toBe(true)
    expect(needsSolidInk('#000000', '#ffffff')).toBe(false)
    expect(needsSolidInk('#222222', '#ffffff')).toBe(false)
    expect(needsSolidInk('#cacaca', '#171717')).toBe(false)
    expect(needsSolidInk('#4d4d4c', '#00000000')).toBe(false)
  })

  it('darkens only the light-theme foreground and the matching cursor', () => {
    const theme = solidifyLightTheme({
      foreground: '#4d4d4c',
      background: '#ffffff',
      cursor: '#4d4d4c',
      red: '#c82829',
    })
    expect(theme).toEqual({
      foreground: SOLID_LIGHT_INK,
      background: '#ffffff',
      cursor: SOLID_LIGHT_INK,
      cursorAccent: '#ffffff',
      red: '#c82829',
    })
    expect(solidifyLightTheme({ foreground: '#cacaca', background: '#171717', cursor: '#bbbbbb' })).toBeNull()
  })

  it('reads the desktop monospace family and replaces only Liberation Mono', () => {
    expect(parseDesktopMonospace("'Consolas 12'")).toBe('Consolas')
    expect(parseDesktopMonospace('"JetBrains Mono 13"')).toBe('JetBrains Mono')
    expect(parseDesktopMonospace('')).toBeNull()
    expect(replacementFontFamily('Liberation Mono', 'Consolas')).toBe('Consolas')
    expect(replacementFontFamily('JetBrains Mono', 'Consolas')).toBeNull()
    expect(replacementFontFamily('Liberation Mono', null)).toBeNull()
  })

  it('snaps font size and the terminal origin onto the device pixel grid', () => {
    expect(snapFontSize(14, 1)).toBe(14)
    expect(snapFontSize(14, 1.5)).toBe(14)
    expect(snapFontSize(14, 1.25)).toBe(14.4)
    expect(devicePixelDelta(10, 1)).toBe(0)
    expect(devicePixelDelta(10.4, 1)).toBe(-0.4)
    expect(devicePixelDelta(10.4, 2)).toBe(0.1)
  })
})
