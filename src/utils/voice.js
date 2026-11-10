// 语音输入适配层
// - H5: 浏览器原生 SpeechRecognition (Chrome/Edge/Safari 14.1+)
// - 微信小程序: 微信同声传译插件已于 2026 年下架停用，小程序端暂时没有内置
//   语音转写能力，voiceSupported() 统一返回 false。后续如果接入微信云开发
//   + 腾讯云 ASR / 百度语音识别等，可以在 mp-weixin 分支里重新实现。

const ERROR_TEXT = {
  'not-allowed': '麦克风权限被拒绝',
  'service-not-allowed': '浏览器未授权语音服务',
  'no-speech': '没有听到声音，请再试一次',
  network: '网络异常，语音识别失败',
  'audio-capture': '未检测到麦克风'
}

let recognition = null

export function voiceSupported() {
  // #ifdef H5
  return typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  // #endif

  // #ifdef MP-WEIXIN
  // 微信同声传译插件已下架停用（2026-03-13 微信开放社区公告），
  // 新注册的小程序无法添加。暂时没有内置语音转写方案。
  return false
  // #endif

  // #ifndef H5 || MP-WEIXIN
  return false
  // #endif
}

export function startVoice({ onText, onError, onEnd }) {
  // #ifdef H5
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SR) {
    onError && onError(new Error('当前浏览器不支持语音识别，请手动输入'))
    return false
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
      onEnd && onEnd()
    }
    recognition = rec
    rec.start()
    return true
  } catch (e) {
    onError && onError(new Error('无法启动语音识别'))
    return false
  }
  // #endif

  // #ifdef MP-WEIXIN
  onError &&
    onError(new Error('微信同声传译插件已下架，小程序端暂不支持语音输入，请手动打字'))
  return false
  // #endif

  // #ifndef H5 || MP-WEIXIN
  onError && onError(new Error('当前端暂不支持语音输入'))
  return false
  // #endif
}

export function stopVoice() {
  // #ifdef H5
  if (recognition) {
    try {
      recognition.stop()
    } catch (e) {
      recognition = null
    }
  }
  // #endif
}
