/**
 * Holds incomplete CSI/OSC sequences so a control sequence split across chunks
 * never leaks into the transcript. Complete sequences are dropped. Visible text is returned.
 */
export class VisibleTextFilter {
  private held = ''

  push(chunk: string): string {
    const data = this.held + chunk
    this.held = ''
    let out = ''
    for (let i = 0; i < data.length; i++) {
      if (data[i] !== '\u001b') {
        out += data[i]
        continue
      }
      const consumed = consumeEscape(data.slice(i))
      if (consumed == null) {
        this.held = data.slice(i)
        break
      }
      i += consumed - 1
    }
    return out
  }

  flush(): string {
    const rest = this.held
    this.held = ''
    if (!rest) return ''
    if (rest[0] === '\u001b') return ''
    return rest
  }
}

function consumeEscape(sequence: string): number | null {
  if (sequence.length < 2) return null
  const kind = sequence[1]
  if (kind === '[') {
    for (let i = 2; i < sequence.length; i++) {
      const code = sequence.charCodeAt(i)
      if (code >= 0x40 && code <= 0x7e) return i + 1
    }
    return null
  }
  if (kind === ']') {
    for (let i = 2; i < sequence.length; i++) {
      if (sequence[i] === '\u0007') return i + 1
      if (sequence[i] === '\u001b') {
        if (i + 1 >= sequence.length) return null
        if (sequence[i + 1] === '\\') return i + 2
      }
    }
    return null
  }
  return 2
}
