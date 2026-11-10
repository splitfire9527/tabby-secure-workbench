/** Streaming control parser: retain state, never retain an unbounded control payload. */
export class VisibleTextFilter {
  private state: 'text' | 'escape' | 'csi' | 'string' | 'stringEscape' = 'text'
  private osc = false

  push(chunk: string): string {
    let out = ''
    for (const char of chunk) {
      if (this.state === 'string' || this.state === 'stringEscape') {
        if (char === '\u009c' || (this.osc && char === '\u0007') ||
            (this.state === 'stringEscape' && char === '\\')) {
          this.state = 'text'
        } else {
          this.state = char === '\u001b' ? 'stringEscape' : 'string'
        }
        continue
      }
      if (char === '\u001b') { this.state = 'escape'; continue }
      if (this.state === 'escape') {
        if (char === '[') this.state = 'csi'
        else if (']PX^_'.includes(char)) { this.osc = char === ']'; this.state = 'string' }
        else if (char >= ' ' && char <= '/') { /* escape intermediate */ }
        else this.state = 'text'
        continue
      }
      if (this.state === 'csi') {
        if (char >= '@' && char <= '~') this.state = 'text'
        continue
      }
      if (char === '\u009b') { this.state = 'csi'; continue }
      if ('\u0090\u009d\u009e\u009f\u0098'.includes(char)) {
        this.osc = char === '\u009d'
        this.state = 'string'
        continue
      }
      if (char === '\t' || char === '\n' || char === '\r' || (char >= ' ' && !(char >= '\u007f' && char <= '\u009f'))) out += char
    }
    return out
  }

  flush(): string {
    this.state = 'text'
    return ''
  }
}
