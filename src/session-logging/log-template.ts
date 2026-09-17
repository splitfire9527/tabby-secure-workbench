import * as path from 'path'

export interface LogTemplateVariables {
  host?: string
  sessionName?: string
  date?: Date
}

/**
 * Sanitizes a string to be safely used as a filename component,
 * strictly preventing directory traversal and illegal characters.
 */
export function sanitizeFilenameComponent(value: string): string {
  if (!value) return 'unknown'
  return value
    .replace(/[\/\\:\*\?"<>\|\x00-\x1f]/g, '_')
    .replace(/\.\./g, '_')
    .trim() || 'unknown'
}

/**
 * Resolves a filename template containing tokens into a safe filename.
 * Supported tokens:
 *   %H - Hostname
 *   %S - Session name / tab title
 *   %Y - 4-digit Year (e.g. 2026)
 *   %M - 2-digit Month (01-12)
 *   %D - 2-digit Day of month (01-31)
 *   %h - 2-digit Hour (00-23)
 *   %m - 2-digit Minute (00-59)
 *   %s - 2-digit Second (00-59)
 */
export function resolveLogFilename(
  template: string,
  vars: LogTemplateVariables = {}
): string {
  const d = vars.date || new Date()

  const year = String(d.getFullYear())
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hour = String(d.getHours()).padStart(2, '0')
  const minute = String(d.getMinutes()).padStart(2, '0')
  const second = String(d.getSeconds()).padStart(2, '0')

  const safeHost = sanitizeFilenameComponent(vars.host || 'localhost')
  const safeSession = sanitizeFilenameComponent(vars.sessionName || 'session')

  let result = template
    .replace(/%H/g, safeHost)
    .replace(/%S/g, safeSession)
    .replace(/%Y/g, year)
    .replace(/%M/g, month)
    .replace(/%D/g, day)
    .replace(/%h/g, hour)
    .replace(/%m/g, minute)
    .replace(/%s/g, second)

  // Ensure result is strictly a basename without directory separators
  result = path.basename(result)

  return result
}
