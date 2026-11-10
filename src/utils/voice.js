// 语音输入适配层
// - H5: 浏览器原生 SpeechRecognition (Chrome/Edge/Safari 14.1+)
//   注意：必须是 HTTPS 或 localhost 才能用。HTTP 环境即使 localhost 也可能不工作。
// - 微信小程序: 微信同声传译插件已于 2026 年下架停用，小程序端暂时没有内置
//   语音转写能力，voiceSupported() 统一返回 false。后续如果接入微信云开发
//   + 腾讯云 ASR / 百度语音识别等，可以在 mp-weixin 分支里重新实现。

const ERROR_TEXT = {
  'not-allowed': '麦克风权限被拒绝，请在浏览器地址栏左侧点击锁形图标 → 站点设置 → 允许麦克风',
  'service-not-allowed': '浏览器未授权语音服务，可能是 HTTP 环境，请用 HTTPS 或 localhost 访问',
  'no-speech': '没有听到声音，请再试一次',
  network: '网络异常，语音识别失败',
  'audio-capture': '未检测到麦克风，请确认电脑已连接麦克风设备'
}

let recognition = null
let mediaStream = null

function isHttpContext() {
  if (typeof window === 'undefined') return false
  const proto = window.location && window.location.protocol
  if (!proto) return false
  // localhost / 127.0.0.1 例外
  const host = window.location.hostname || ''
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return false
  return proto === 'http:'
}

export function voiceSupported() {
  // #ifdef H5
  return typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  // #endif

  // #ifdef MP-WEIXIN
  return false
  // #endif

  // #ifndef H5 || MP-WEIXIN
  return false
  // #endif
}

export function startVoice({ onText, onError, onEnd }) {
  // #ifdef H5
  // 1. 先检查环境
  if (isHttpContext()) {
    onError && onError(new Error(
      '语音识别需要 HTTPS 或 localhost，当前是 HTTP 环境。\n' +
      '本地开发请用 npm run dev:h5（它默认跑在 http://localhost:5173，可用）\n' +
      '线上部署请开启 HTTPS'
    ))
    return false
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    onError && onError(new Error('当前浏览器不支持麦克风 API，请用 Chrome / Edge / Safari'))
    return false
  }

  // 2. 先唤起麦克风权限（第一次用会弹浏览器权限框）
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      mediaStream = stream
      // 权限拿到了，再启动 SpeechRecognition
      _startSR({ onText, onError, onEnd })
    })
    .catch(err => {
      // 用户拒绝了 / 没有麦克风
      const name = err && (err.name || err.error)
      let msg = ERROR_TEXT[name] || '麦克风权限获取失败'
      if (name === 'NotAllowedError') {
        msg = '麦克风权限被拒绝。请点击浏览器地址栏左侧的锁形图标 → 站点设置 → 麦克风 → 允许，然后刷新页面重试'
      } else if (name === 'NotFoundError') {
        msg = '未检测到麦克风设备，请确认电脑已连接麦克风'
      } else if (name === 'NotReadableError') {
        msg = '麦克风被其他程序占用（比如微信会议、Zoom），请关闭后重试'
      }
      onError && onError(new Error(msg))
    })
  return true
  // #endif

  // #ifdef MP-WEIXIN
  onError && onError(new Error('微信同声传译插件已下架，小程序端暂不支持语音输入，请手动打字'))
  return false
  // #endif

  // #ifndef H5 || MP-WEIXIN
  onError && onError(new Error('当前端暂不支持语音输入'))
  return false
  // #endif
}

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
      onError && onError(new Error(ERROR_TEXT[event.error] || '语音识别失败'))
    }
    rec.onend = () => {
      recognition = null
      // 释放 media stream
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
}
