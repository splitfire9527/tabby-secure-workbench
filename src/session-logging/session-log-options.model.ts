export interface SecureCrtLogOptions {
  logFileName: string
  promptForFilename?: boolean
  startLogUponConnect?: boolean
  rawLog?: boolean
  startNewLogAtMidnight?: boolean
  fileExistMode?: 'overwrite' | 'append'
  mode?: 'overwrite' | 'append'
  timestampEachLine?: boolean
  traceLevel?: number
  customLogData?: {
    uponConnect?: string
    uponDisconnect?: string
    onEachLine?: string
    logOnlyCustomData?: boolean
  }
}

export const DEFAULT_SECURECRT_LOG_OPTIONS: SecureCrtLogOptions = {
  logFileName: '%H_%S_%Y%M%D_%h%m%s.log',
  promptForFilename: false,
  startLogUponConnect: false,
  rawLog: false,
  startNewLogAtMidnight: false,
  fileExistMode: 'overwrite',
  mode: 'overwrite',
  timestampEachLine: false,
  traceLevel: 0,
  customLogData: {
    uponConnect: '',
    uponDisconnect: '',
    onEachLine: '',
    logOnlyCustomData: false,
  },
}
