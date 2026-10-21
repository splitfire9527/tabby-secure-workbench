export interface PortForwardRule {
  type: 'local' | 'remote' | 'dynamic'
  sourceHost: string
  sourcePort: number
  targetHost: string
  targetPort: number
}

export const PORT_FORWARD_SAVED_NOTICE = '端口转发规则已保存。下次重连生效。'

/**
 * Writes a port-forward rule through Tabby's profile config proxy and saves it.
 */
export async function persistPortForward(
  profiles: { getConfigProxyForProfile: (profile: any) => any },
  config: { save: () => Promise<void> | void },
  profile: any,
  rule: PortForwardRule
): Promise<any> {
  const proxy = profiles.getConfigProxyForProfile(profile)
  if (!proxy.options) proxy.options = {}
  if (!Array.isArray(proxy.options.portForwards)) proxy.options.portForwards = []
  proxy.options.portForwards.push({ ...rule })
  await config.save()
  return proxy
}
