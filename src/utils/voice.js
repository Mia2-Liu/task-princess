const ERROR_TEXT = {
  'not-allowed': '麦克风权限被拒绝',
  'service-not-allowed': '浏览器未授权语音服务',
  'no-speech': '没有听到声音，请再试一次',
  network: '网络异常，语音识别失败',
  'audio-capture': '未检测到麦克风'
}

let recognition = null
let recorder = null

export function voiceSupported() {
  // #ifdef H5
  return typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  // #endif

  // #ifdef MP-WEIXIN
  return typeof requirePlugin === 'function'
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
  try {
    const plugin = requirePlugin('WechatSI')
    recorder = plugin.getRecordRecognitionManager()
    recorder.onRecognize = res => {
      if (res && res.result) onText && onText(res.result, false)
    }
    recorder.onStop = res => {
      if (res && res.result) onText && onText(res.result, true)
      recorder = null
      onEnd && onEnd()
    }
    recorder.onError = err => {
      onError && onError(new Error((err && err.msg) || '语音识别失败'))
      recorder = null
      onEnd && onEnd()
    }
    recorder.start({ lang: 'zh_CN', duration: 60000 })
    return true
  } catch (e) {
    onError &&
      onError(new Error('语音插件不可用，请先在微信后台添加「微信同声传译」插件'))
    return false
  }
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

  // #ifdef MP-WEIXIN
  if (recorder) {
    try {
      recorder.stop()
    } catch (e) {
      recorder = null
    }
  }
  // #endif
}
