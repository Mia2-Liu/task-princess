// 语音输入适配层
//
// 两端实现：
//   H5 浏览器 — Web Speech API + getUserMedia 唤起麦克风权限
//     仅 Chrome / Edge / Safari 14.1+ 支持，必须 HTTPS 或 localhost
//
//   微信小程序 — wx.getRecorderManager + 云开发 asr_recognize 云函数（腾讯云 ASR）
//     需要在 src/config.js 填 CLOUD_ENV，云开发控制台上传 asr_recognize 云函数，
//     云函数环境变量里配置腾讯云 SecretId/SecretKey。
//     配额：腾讯云 ASR 一句话识别默认 5000 次/天免费。

import { isCloudEnabled, callASR } from '@/utils/cloud'
import { TENCENT_ASR } from '@/config'

const MP_ERROR_TEXT = {
  'scope.record': '麦克风权限未授权。请在微信 → 设置 → 隐私设置 → 麦克风 → 允许小程序使用',
  'auth fail': '麦克风权限被拒绝，请在微信里允许小程序使用麦克风',
  default: '录音失败'
}

let recognition = null
let mediaStream = null

function isHttpContext() {
  if (typeof window === 'undefined') return false
  const proto = window.location && window.location.protocol
  if (!proto) return false
  const host = window.location.hostname || ''
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return false
  return proto === 'http:'
}

// ============================================================
// voiceSupported — 告诉界面能不能显示麦克风按钮
//
// MP-WEIXIN 端：getRecorderManager 是微信原生能力，所有版本都有，
//   所以按钮始终显示。真正需要云开发做语音转写时，startVoice 里
//   会做 lazy check，没配 CLOUD_ENV 会弹引导。
// ============================================================
export function voiceSupported() {
  // #ifdef H5
  return typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  // #endif

  // #ifdef MP-WEIXIN
  return typeof wx !== 'undefined' && !!wx.getRecorderManager
  // #endif

  // #ifndef H5 || MP-WEIXIN
  return false
  // #endif
}

// ============================================================
// startVoice — 开始语音输入
// ============================================================
export function startVoice({ onText, onError, onEnd }) {
  // #ifdef H5
  // --- H5：浏览器 Web Speech API ---
  if (isHttpContext()) {
    onError && onError(new Error(
      '语音识别需要 HTTPS 或 localhost，当前是 HTTP 环境。\n' +
      '本地开发请用 npm run dev:h5（默认 http://localhost:5173，可用）\n' +
      '线上部署请开启 HTTPS'
    ))
    return false
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    onError && onError(new Error('当前浏览器不支持麦克风 API，请用 Chrome / Edge / Safari'))
    return false
  }

  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      mediaStream = stream
      _startSR({ onText, onError, onEnd })
    })
    .catch(err => {
      const name = err && (err.name || err.error)
      let msg = '麦克风权限获取失败'
      if (name === 'NotAllowedError') {
        msg = '麦克风权限被拒绝。请点击浏览器地址栏左侧锁形图标 → 站点设置 → 麦克风 → 允许，然后刷新页面重试'
      } else if (name === 'NotFoundError') {
        msg = '未检测到麦克风设备，请确认电脑已连接麦克风'
      } else if (name === 'NotReadableError') {
        msg = '麦克风被其他程序占用（微信会议/Zoom），请关闭后重试'
      }
      onError && onError(new Error(msg))
    })
  return true
  // #endif

  // #ifdef MP-WEIXIN
  // --- 微信小程序：getRecorderManager → 云函数识别 ---
  if (!isCloudEnabled()) {
    // 按钮已经显示了，但云开发没配 → 弹引导，告诉用户三步搞定
    try {
      wx.showModal({
        title: '语音转写需要先配置云开发',
        content:
          '语音识别走微信云开发 + 腾讯云 ASR，默认每天 5000 次免费。\n\n' +
          '需要做 3 件事：\n' +
          '1. 微信开发者工具 → 云开发 → 开通（免费版就行）\n' +
          '2. 复制环境 ID，填 src/config.js 里的 CLOUD_ENV\n' +
          '3. 右键 cloudfunctions/asr_recognize → 上传并部署\n\n' +
          '代码仓库 README 里有详细步骤。',
        showCancel: false,
        confirmText: '好的'
      })
    } catch (e) {}
    onError && onError(new Error('云开发未配置，请按弹窗提示完成 3 步'))
    return false
  }
  _startMP({ onText, onError, onEnd })
  return true
  // #endif

  // #ifndef H5 || MP-WEIXIN
  onError && onError(new Error('当前端暂不支持语音输入'))
  return false
  // #endif
}

// ============================================================
// stopVoice — 停止录音
// ============================================================
export function stopVoice() {
  // #ifdef H5
  if (recognition) {
    try { recognition.stop() } catch (e) { recognition = null }
  }
  if (mediaStream) {
    try { mediaStream.getTracks().forEach(t => t.stop()) } catch (e) {}
    mediaStream = null
  }
  // #endif

  // #ifdef MP-WEIXIN
  try {
    const rm = wx.getRecorderManager()
    rm && rm.stop()
  } catch (e) {}
  // #endif
}

// ============================================================
// H5 内部：启动 Web Speech Recognition
// ============================================================
function _startSR({ onText, onError, onEnd }) {
  // #ifdef H5
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SR) {
    onError && onError(new Error('当前浏览器不支持语音识别，请用 Chrome / Edge / Safari'))
    return
  }
  try {
    const rec = new SR()
    rec.lang = 'zh-CN'
    rec.continuous = true
    rec.interimResults = true
    let finalText = ''
    rec.onresult = event => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        if (result.isFinal) finalText += result[0].transcript
        else interim += result[0].transcript
      }
      onText && onText(finalText + interim, false)
    }
    rec.onerror = event => {
      const msgMap = {
        'not-allowed': '麦克风权限被拒绝，请在浏览器地址栏左侧点击锁形图标 → 站点设置 → 允许麦克风',
        'service-not-allowed': '浏览器未授权语音服务，可能是 HTTP 环境，请用 HTTPS 或 localhost',
        'no-speech': '没有听到声音，请再试一次',
        'audio-capture': '未检测到麦克风，请确认电脑已连接麦克风设备'
      }
      onError && onError(new Error(msgMap[event.error] || '语音识别失败'))
    }
    rec.onend = () => {
      recognition = null
      if (mediaStream) {
        try { mediaStream.getTracks().forEach(t => t.stop()) } catch (e) {}
        mediaStream = null
      }
      onEnd && onEnd()
    }
    recognition = rec
    rec.start()
  } catch (e) {
    onError && onError(new Error('无法启动语音识别：' + (e.message || e)))
  }
  // #endif
}

// ============================================================
// MP-WEIXIN 内部：录音 + 云函数识别
// ============================================================
function _startMP({ onText, onError, onEnd }) {
  // #ifdef MP-WEIXIN
  const rm = wx.getRecorderManager()
  const format = (TENCENT_ASR && TENCENT_ASR.recordFormat) || 'mp3'

  // 注册回调（每次 start 前都要注册）
  rm.onStop(async res => {
    try {
      if (res && res.duration <= 300) {
        // 录音太短，没说什么
        onError && onError(new Error('录音太短，没听到内容'))
        onEnd && onEnd()
        return
      }
      onText && onText('正在识别…', false)
      const result = await callASR({ tempFilePath: res.tempFilePath, format })
      if (result.ok) {
        onText && onText(result.text || '', true)
      } else {
        onError && onError(new Error(result.error || '识别失败'))
      }
    } catch (e) {
      onError && onError(new Error((e && e.message) || '录音回调异常'))
    }
    onEnd && onEnd()
  })
  rm.onError(err => {
    const msg = (err && err.errMsg) || '录音失败'
    onError && onError(new Error(msg))
    onEnd && onEnd()
  })

  // 唤起录音权限 → 开始录音
  wx.authorize({
    scope: 'scope.record',
    success: () => {
      rm.start({
        duration: 60000,
        sampleRate: (TENCENT_ASR && TENCENT_ASR.sampleRate) || 16000,
        numberOfChannels: 1,
        encodeBitRate: 48000,
        format
      })
    },
    fail: () => {
      // 用户还没授权过 → wx.authorize 弹框让用户确认
      // 已经拒绝过 → 直接失败提示
      wx.showModal({
        title: '需要麦克风权限',
        content: '请在微信设置里允许小程序使用麦克风：设置 → 隐私设置 → 麦克风',
        confirmText: '去设置',
        success: mres => {
          if (mres.confirm) wx.openSetting()
        }
      })
      onError && onError(new Error(MP_ERROR_TEXT['auth fail']))
      onEnd && onEnd()
    }
  })
  // #endif
}
