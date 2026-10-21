import { StatefulCodec } from './stateful-codec'

/**
 * Binds a codec to the public BaseSession entry points.
 * emitOutput is wrapped once. write is wrapped once. Tabby does not invoke a middleware array.
 */
export function bindSessionCodec(session: any, codec: StatefulCodec): () => void {
  if (!session || session.__workbenchCodecBound) {
    return () => {}
  }
  session.__workbenchCodecBound = true

  const originalEmit = typeof session.emitOutput === 'function' ? session.emitOutput.bind(session) : null
  const originalWrite = typeof session.write === 'function' ? session.write.bind(session) : null

  if (originalEmit) {
    session.emitOutput = (data: Buffer) => {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data)
      const { utf8Bytes } = codec.decodeChunk(buffer)
      if (utf8Bytes.length > 0) {
        originalEmit(utf8Bytes)
      }
    }
  }

  if (originalWrite) {
    session.write = (data: Buffer) => {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data)
      originalWrite(codec.encodeInput(buffer))
    }
  }

  return () => {
    if (originalEmit) session.emitOutput = originalEmit
    if (originalWrite) session.write = originalWrite
    delete session.__workbenchCodecBound
  }
}
