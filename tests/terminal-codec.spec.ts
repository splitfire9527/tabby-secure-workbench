import * as iconv from 'iconv-lite'
import { StatefulCodec } from '../src/terminal-codec/stateful-codec'

describe('Terminal Codec Layer - StatefulCodec (§5)', () => {
  describe('Multi-byte chunk boundary handling', () => {
    it('should correctly decode UTF-8 split across chunks', () => {
      const codec = new StatefulCodec('UTF-8')
      const chineseText = '你好世界！'
      const fullBuffer = Buffer.from(chineseText, 'utf-8')

      // Split buffer right in the middle of multi-byte characters
      const part1 = fullBuffer.slice(0, 4) // cut inside 2nd char
      const part2 = fullBuffer.slice(4, 8)
      const part3 = fullBuffer.slice(8)

      const res1 = codec.decodeChunk(part1)
      const res2 = codec.decodeChunk(part2)
      const res3 = codec.decodeChunk(part3)

      const combinedText = res1.text + res2.text + res3.text
      expect(combinedText).toBe(chineseText)
    })

    it('should correctly decode GBK split across chunks', () => {
      const codec = new StatefulCodec('GBK')
      const text = '测试GBK中文字符流'
      const gbkBytes = iconv.encode(text, 'gbk')

      // Cut in the middle of a 2-byte GBK character
      const part1 = gbkBytes.slice(0, 3) // 1st char (2 bytes) + half of 2nd char (1 byte)
      const part2 = gbkBytes.slice(3)

      const res1 = codec.decodeChunk(part1)
      const res2 = codec.decodeChunk(part2)

      expect(res1.text + res2.text).toBe(text)
    })

    it('should correctly decode GB18030 4-byte characters across chunk boundaries', () => {
      const codec = new StatefulCodec('GB18030')
      // Rare character / emoji in GB18030 4-byte range
      const text = '𠮷野家'
      const gb18030Bytes = iconv.encode(text, 'gb18030')

      // Split between 2nd and 3rd byte of the 4-byte character
      const part1 = gb18030Bytes.slice(0, 2)
      const part2 = gb18030Bytes.slice(2)

      const res1 = codec.decodeChunk(part1)
      const res2 = codec.decodeChunk(part2)

      expect(res1.text + res2.text).toBe(text)
    })

    it('should correctly decode BIG5 across chunk boundaries', () => {
      const codec = new StatefulCodec('BIG5')
      const text = '繁體中文測試'
      const big5Bytes = iconv.encode(text, 'big5')

      const part1 = big5Bytes.slice(0, 5) // odd byte cut
      const part2 = big5Bytes.slice(5)

      const res1 = codec.decodeChunk(part1)
      const res2 = codec.decodeChunk(part2)

      expect(res1.text + res2.text).toBe(text)
    })
  })

  describe('Dynamic Encoding Switching (§5.2)', () => {
    it('should flush incomplete bytes as U+FFFD and switch encoding cleanly', () => {
      const codec = new StatefulCodec('GBK')

      // Send 1 orphan byte of a 2-byte GBK sequence
      codec.decodeChunk(Buffer.from([0xc4]))

      // Switch to UTF-8
      const changeEvent = codec.switchEncoding('UTF-8')

      expect(changeEvent.oldEncoding).toBe('GBK')
      expect(changeEvent.newEncoding).toBe('UTF-8')
      expect(changeEvent.flushedText).toBe('\uFFFD')
      expect(codec.encoding).toBe('UTF-8')

      // Subsequent UTF-8 decoding functions normally
      const utfRes = codec.decodeChunk(Buffer.from('Hello UTF-8', 'utf-8'))
      expect(utfRes.text).toBe('Hello UTF-8')
    })

    it('should preserve ASCII ANSI escape sequences across all encodings', () => {
      const gbkCodec = new StatefulCodec('GBK')
      const ansiCode = '\x1b[32mSuccess\x1b[0m'
      const bytes = Buffer.from(ansiCode, 'ascii')

      const res = gbkCodec.decodeChunk(bytes)
      expect(res.text).toBe(ansiCode)
      expect(res.utf8Bytes.toString('utf-8')).toBe(ansiCode)
    })
  })

  describe('Terminal input encoding', () => {
    it('should encode terminal UTF-8 input into target remote GBK bytes', () => {
      const codec = new StatefulCodec('GBK')
      const inputBuffer = Buffer.from('你好', 'utf-8')

      const encoded = codec.encodeInput(inputBuffer)
      expect(encoded).toEqual(iconv.encode('你好', 'gbk'))
    })

    it('should pass through UTF-8 input unmodified when target is UTF-8', () => {
      const codec = new StatefulCodec('UTF-8')
      const inputBuffer = Buffer.from('Hello 世界', 'utf-8')

      const encoded = codec.encodeInput(inputBuffer)
      expect(encoded).toBe(inputBuffer)
    })
  })
})
