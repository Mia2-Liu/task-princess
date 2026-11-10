// ============================================================
// 微信云开发 + 腾讯云 ASR 语音识别 配置
// ============================================================
// CLOUD_ENV：云开发环境 ID（必填，否则小程序端 voiceSupported() 返回 false）
//   获取：微信开发者工具 → 云开发控制台 → 设置 → 环境 ID
export const CLOUD_ENV = ''

// 腾讯云 ASR 密钥（建议**不要**写在前端，改放云函数环境变量）
// 下面两个字段仅用于 voiceSupported() 在开发时做"配了没"的自检，
// 真正调用在云函数 asr_recognize 里从 process.env.TENCENT_SECRET_ID 读。
// 留空也没关系，云函数端报错信息会明确告诉你缺什么。
export const TENCENT_ASR = {
  // 下面留空，云函数里配了环境变量就能用
  SecretId: '',
  SecretKey: '',
  // 录音格式（wx.getRecorderManager 的 format 参数）
  // mp3 体积小，推荐。可选：'mp3' | 'wav' | 'pcm' | 'm4a'
  recordFormat: 'mp3',
  // 采样率（必须和云函数里 EngineModelType 对应）
  sampleRate: 16000
}
