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
let h5StopRequested = false

// 小程序端：RecorderManager 是全局单例，回调只能注册一次，
// 否则每次录音都会叠加一个 onStop，导致重复识别。
let mpRecorder = null
let mpHandlers = null
let mpRecording = false
let mpStopRequested = false
let mpLastStopAt = 0

// 云函数调用常见错误码 → 人话
export function friendlyError(msg) {
  const text = String(msg || '')
  if (!text) return '语音识别失败'
  if (text.indexOf('-504000') >= 0 || text.indexOf('FUNCTION_NOT_FOUND') >= 0) {
    return '云函数不存在或未部署成功（错误：' + text + '）。' +
      '到云开发控制台 → 云函数列表，确认 asr_recognize 和 sync 都显示「已部署」'
  }
  if (text.indexOf('-504002') >= 0) {
    return '云函数执行出错，请到云开发控制台 → 云函数 → asr_recognize → 日志 查看原因'
  }
  if (text.toLowerCase().indexOf('unopened') >= 0) {
    return '腾讯云账号还没开通「语音识别」服务。\n\n' +
      '1. 打开 https://console.cloud.tencent.com/asr\n' +
      '2. 点击「立即开通」，完成实名认证\n' +
      '3. 等 1 分钟再试\n\n' +
      '错误原文：' + text
  }
  if (text.indexOf('-501000') >= 0 || text.indexOf('-601001') >= 0) {
    return '云开发环境不可用，请检查 src/config.js 里的 CLOUD_ENV 是否正确'
  }
  return text
}

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
export function startVoice({ onText, onError, onEnd, onStatus }) {
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

  h5StopRequested = false
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      if (h5StopRequested) {
        // 权限还没弹完用户就松手了
        h5StopRequested = false
        try { stream.getTracks().forEach(t => t.stop()) } catch (e) {}
        onEnd && onEnd()
        return
      }
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
  _startMP({ onText, onError, onEnd, onStatus })
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
  } else if (!mediaStream) {
    h5StopRequested = true
  }
  if (mediaStream) {
    try { mediaStream.getTracks().forEach(t => t.stop()) } catch (e) {}
    mediaStream = null
  }
  // #endif

  // #ifdef MP-WEIXIN
  if (mpRecording && mpRecorder) {
    try { mpRecorder.stop() } catch (e) {}
  } else {
    // 权限弹窗/启动还没走完就松手了，等真正开始时立刻停
    mpStopRequested = true
  }
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
function _startMP({ onText, onError, onEnd, onStatus }) {
  // #ifdef MP-WEIXIN
  const format = (TENCENT_ASR && TENCENT_ASR.recordFormat) || 'mp3'
  const rm = getMPRecorder()

  // 回调只注册一次，每次录音只切换当前会话的 handlers
  mpHandlers = { onText, onError, onEnd, onStatus }

  function failAuth() {
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

  function begin() {
    if (mpRecording) {
      // 防止重复点击导致 start 报错
      return
    }
    // 上一次 stop() 后原生录音器需要一点时间收尾，
    // 立刻再 start 会报 operateRecorder:fail is recording or paused
    const gap = Date.now() - mpLastStopAt
    if (gap < 500) {
      setTimeout(begin, 500 - gap)
      return
    }
    mpRecording = true
    try {
      rm.start({
        duration: 60000,
        sampleRate: (TENCENT_ASR && TENCENT_ASR.sampleRate) || 16000,
        numberOfChannels: 1,
        encodeBitRate: 48000,
        format
      })
    } catch (e) {
      mpRecording = false
      onError && onError(new Error('录音启动失败：' + ((e && e.message) || e)))
      onEnd && onEnd()
      return
    }
    if (mpStopRequested) {
      mpStopRequested = false
      try { rm.stop() } catch (e) {}
    }
  }

  // 唤起录音权限 → 开始录音
  wx.authorize({
    scope: 'scope.record',
    success: begin,
    fail: failAuth
  })
  // #endif
}

// 拿到全局唯一的 RecorderManager，并只注册一次回调
function getMPRecorder() {
  // #ifdef MP-WEIXIN
  if (mpRecorder) return mpRecorder
  mpRecorder = wx.getRecorderManager()

  mpRecorder.onStop(async res => {
    mpRecording = false
    mpLastStopAt = Date.now()
    const handlers = mpHandlers || {}
    const { onText, onError, onEnd, onStatus } = handlers
    try {
      if (res && res.duration <= 300) {
        onError && onError(new Error('说太短了，按住多说一会儿'))
        onEnd && onEnd()
        return
      }
      // 状态提示走 onStatus，不能走 onText，否则会被当成正文提交
      onStatus && onStatus('正在识别…')
      const format = (TENCENT_ASR && TENCENT_ASR.recordFormat) || 'mp3'
      const result = await callASR({ tempFilePath: res.tempFilePath, format })
      if (result.ok) {
        if (result.text) {
          onText && onText(result.text, true)
        } else {
          onError && onError(new Error('没听清，再说一次试试'))
        }
      } else {
        onError && onError(new Error(friendlyError(result.error)))
      }
    } catch (e) {
      onError && onError(new Error((e && e.message) || '录音回调异常'))
    }
    onEnd && onEnd()
  })

  mpRecorder.onError(err => {
    mpRecording = false
    mpLastStopAt = Date.now()
    const handlers = mpHandlers || {}
    const { onError, onEnd } = handlers
    const raw = (err && err.errMsg) || '录音失败'
    if (raw.indexOf('is recording or paused') >= 0) {
      onError && onError(new Error('录音还没结束，请松开后等一秒再按一次'))
    } else {
      onError && onError(new Error(raw))
    }
    onEnd && onEnd()
  })

  return mpRecorder
  // #endif
}
