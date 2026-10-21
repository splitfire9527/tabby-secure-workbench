export const NATIVE_SFTP_ATTR = 'data-workbench-native-sftp'

export interface NativeSftpVisibilityResult {
  hidden: number
  recognized: boolean
}

function isNativeSftpButton(button: Element): boolean {
  if (button.getAttribute('data-tabby-sftp-ui-button') != null) return true
  const title = (button.getAttribute('title') || '').trim()
  return /^sftp$/i.test(title)
}

/**
 * Marks only buttons that are identifiable as the native SFTP action.
 * Folder, plus, and settings buttons are left untouched.
 * When hide is false, any previous mark is removed.
 */
export function applyNativeSftpVisibility(root: ParentNode, hide: boolean): NativeSftpVisibilityResult {
  const marked = Array.from(root.querySelectorAll(`[${NATIVE_SFTP_ATTR}]`))
  if (!hide) {
    for (const el of marked) el.removeAttribute(NATIVE_SFTP_ATTR)
    return { hidden: 0, recognized: true }
  }

  const buttons = Array.from(root.querySelectorAll('button')).filter(isNativeSftpButton)
  if (buttons.length === 0) {
    return { hidden: 0, recognized: false }
  }
  for (const button of buttons) button.setAttribute(NATIVE_SFTP_ATTR, '1')
  return { hidden: buttons.length, recognized: true }
}
