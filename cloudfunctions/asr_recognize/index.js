// 微信云开发语音识别云函数
// 使用腾讯云 ASR 新版 SDK 做"一句话识别"（音频 ≤60秒，≤1MB）
//
// 部署步骤（一次就行）：
//   1. 微信开发者工具 → 云开发控制台 → 设置 → 环境变量
//      新增两条：
//        TENCENT_SECRET_ID  = 腾讯云 API 密钥 SecretId
//        TENCENT_SECRET_KEY = 腾讯云 API 密钥 SecretKey
//   2. 右键 cloudfunctions/asr_recognize → 上传并部署：云端安装依赖
//   3. 云函数配置 → 并发数 ≥ 3（语音识别比较慢）
//
// 腾讯云密钥获取：
//   https://console.cloud.tencent.com/cam/capi → 新建密钥 → 复制 SecretId/SecretKey
//
// 配额：腾讯云 ASR 一句话识别默认 5000 次/天免费，超出后约 0.0012 元/次
// 文档：https://cloud.tencent.com/document/product/1073/37995

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

let _sdk = null
function getSDK() {
  if (_sdk) return _sdk
  try {
    _sdk = require('tencentcloud-sdk-nodejs')
  } catch (e) {
    _sdk = null
  }
  return _sdk
}

function initASRClient() {
  const SDK = getSDK()
  if (!SDK) return null
  const SecretId = process.env.TENCENT_SECRET_ID
  const SecretKey = process.env.TENCENT_SECRET_KEY
  if (!SecretId || !SecretKey) return null

  const AsrClient = SDK.asr.v20190614.Client
  const clientConfig = {
    credential: { secretId: SecretId, secretKey: SecretKey },
    region: 'ap-beijing',
    profile: {
      httpProfile: { endpoint: 'asr.tencentcloudapi.com' }
    }
  }
  return new AsrClient(clientConfig)
}

// 腾讯云 SentenceRecognition 的 VoiceFormat 是字符串
// 支持：wav / pcm / ogg-opus / speex / silk / mp3 / m4a / aac
// 参考：https://cloud.tencent.com/document/product/1093/35646
function normalizeVoiceFormat(wxFormat) {
  const fmt = String(wxFormat || 'mp3').toLowerCase()
  const allowed = ['wav', 'pcm', 'ogg-opus', 'speex', 'silk', 'mp3', 'm4a', 'aac']
  return allowed.indexOf(fmt) >= 0 ? fmt : 'mp3'
}

// 下载云存储文件，返回 Buffer
// 注意：wx-server-sdk 的 downloadFile 返回的是 { fileContent: Buffer }，
// 不是 { tempFilePath }，这里不能当成本地路径用。
async function downloadFromCloud(fileID) {
  const res = await cloud.downloadFile({ fileID })
  const buf = res && res.fileContent
  if (!buf || !buf.length) throw new Error('云存储文件为空或下载失败')
  return buf
}

// 腾讯云 ASR 一句话识别（≤60秒，≤1MB）
// 接口是 SentenceRecognition（同步返回 Result），不是 RecognizeTask（异步任务）。
async function recognizeOneShot(audioBuf, voiceFormat) {
  const client = initASRClient()
  if (!client) {
    // SDK 没装或密钥没配
    if (!getSDK()) throw new Error('tencentcloud-sdk-nodejs 未安装，请先云端安装依赖')
    throw new Error('腾讯云 SecretId/SecretKey 未配置，请在云开发控制台新增环境变量')
  }

  if (audioBuf.length > 1024 * 1024) {
    throw new Error('音频超过 1MB（一句话识别上限），请控制在 60 秒以内')
  }

  const params = {
    ProjectId: 0,
    SubServiceType: 2,          // 2: 一句话识别（mp3/m4a/wav 等）
    EngSerViceType: '16k_zh',   // 16k 中文通用
    SourceType: 1,              // 1: 音频数据直传（Data 字段）
    VoiceFormat: normalizeVoiceFormat(voiceFormat),
    Data: audioBuf.toString('base64'),
    DataLen: audioBuf.length,
    FilterDirty: 1,             // 脏词过滤
    FilterModal: 1,             // 过滤语气词
    ConvertNumMode: 1,          // 阿拉伯数字
    WordInfo: 0
  }

  const resp = await client.SentenceRecognition(params)
  if (!resp) throw new Error('ASR 返回空结果')
  return resp.Result || ''
}

exports.main = async event => {
  const fileID = event && event.fileID
  const voiceFormat = event && event.format || 'mp3'

  if (!fileID) {
    return { ok: false, error: '缺少 fileID' }
  }

  let audioBuf = null
  try {
    audioBuf = await downloadFromCloud(fileID)
    const size = audioBuf.length
    if (size < 1000) {
      return { ok: false, error: `录音数据太少（${size} 字节），请按住说 2 秒以上再松手` }
    }
    const text = await recognizeOneShot(audioBuf, voiceFormat)
    return { ok: true, text }
  } catch (e) {
    const code = (e && (e.code || (e.Error && e.Error.Code))) || ''
    const msg = (e && (e.msg || e.message)) || String(e)
    const size = audioBuf ? audioBuf.length : 0
    return {
      ok: false,
      error: (code ? code + ' ' : '') + msg + `（音频 ${size} 字节）`
    }
  }
}
