import { CLOUD_ENV } from '@/config'

let inited = false

export function isCloudEnabled() {
  // #ifdef MP-WEIXIN
  return !!CLOUD_ENV
  // #endif
  // #ifndef MP-WEIXIN
  return false
  // #endif
}

function ensureInit() {
  if (inited) return true
  if (!isCloudEnabled()) return false
  wx.cloud.init({ env: CLOUD_ENV, traceUser: true })
  inited = true
  return true
}

export async function callSync(action, payload = {}) {
  if (!ensureInit()) return null
  const res = await wx.cloud.callFunction({
    name: 'sync',
    data: { action, ...payload }
  })
  return res ? res.result : null
}
