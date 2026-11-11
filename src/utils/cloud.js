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
  try {
    wx.cloud.init({ env: CLOUD_ENV, traceUser: true })
    inited = true
    return true
  } catch (e) {
    return false
  }
}

export async function callSync(action, payload = {}) {
  if (!ensureInit()) return null
  const res = await wx.cloud.callFunction({
    name: 'sync',
    data: { action, ...payload }
  })
  return res ? res.result : null
}

// 语音识别：上传录音文件到云存储，然后调 asr_recognize 云函数
// file: { tempFilePath, format }  来自 wx.getRecorderManager.onStop 的参数
// 返回：{ ok: true, text } 或 { ok: false, error }
export async function callASR(file) {
  if (!ensureInit()) {
    return { ok: false, error: '云开发未配置（CLOUD_ENV 为空），请在 src/config.js 填环境 ID' }
  }
  if (!file || !file.tempFilePath) {
    return { ok: false, error: '录音临时文件不存在' }
  }

  try {
    // 1. 上传到云存储
    const uploadRes = await wx.cloud.uploadFile({
      cloudPath: `asr/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${file.format || 'mp3'}`,
      filePath: file.tempFilePath
    })
    const fileID = uploadRes.fileID

    // 2. 调云函数
    const fnRes = await wx.cloud.callFunction({
      name: 'asr_recognize',
      data: {
        fileID,
        format: file.format || 'mp3'
      }
    })

    // 3. 删除录音文件（云存储里的临时文件）
    try { await wx.cloud.deleteFile({ fileList: [fileID] }) } catch (e) {}

    const result = fnRes && fnRes.result
    if (!result) return { ok: false, error: '云函数无返回' }
    if (result.ok) return { ok: true, text: result.text || '' }
    return { ok: false, error: result.error || '识别失败' }
  } catch (e) {
    const raw = (e && e.errMsg) || (e && e.message) || String(e)
    return { ok: false, error: 'asr_recognize 调用失败：' + raw }
  }
}
