import { WorkbenchEncoding } from '../config/config.model'

export interface EncodingSwitchPrompt {
  oldEncoding: WorkbenchEncoding
  newEncoding: WorkbenchEncoding
  at: Date
  warning: string
}

export const ENCODING_SWITCH_WARNING = '未完成的多字节序列将以 U+FFFD 写入'

export function describeEncodingSwitch(
  oldEncoding: WorkbenchEncoding,
  newEncoding: WorkbenchEncoding,
  at: Date = new Date()
): EncodingSwitchPrompt {
  return {
    oldEncoding,
    newEncoding,
    at,
    warning: ENCODING_SWITCH_WARNING,
  }
}
