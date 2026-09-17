import { Injectable } from '@angular/core'
import { TerminalColorSchemeProvider, TerminalColorScheme } from 'tabby-terminal'

export const SECURECRT_CLASSIC_SCHEME: TerminalColorScheme = {
  name: 'SecureCRT Classic',
  foreground: '#c0c0c0',
  background: '#000000',
  cursor: '#00ff00',
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

@Injectable()
export class SecureCrtColorSchemeProvider extends TerminalColorSchemeProvider {
  async getSchemes(): Promise<TerminalColorScheme[]> {
    return [SECURECRT_CLASSIC_SCHEME]
  }
}
