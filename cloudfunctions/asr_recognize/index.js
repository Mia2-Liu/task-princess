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

const fs = require('fs')
const os = require('os')
const path = require('path')

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

// 把微信录音 format 映射成腾讯云 ASR 的 VoiceFormat
// 参考：https://cloud.tencent.com/document/product/1073/98636
function mapVoiceFormat(wxFormat) {
  const map = {
    mp3: 8,
    wav: 1,
    pcm: 2,
    m4a: 6,
    aac: 7,
    ogg: 5
  }
  return map[String(wxFormat || 'mp3').toLowerCase()] || 8
}

// 下载云存储文件到 /tmp，返回本地路径
async function downloadFromCloud(fileID) {
  const res = await cloud.downloadFile({ fileID })
  const localPath = res.fileID || res.tempFilePath
  if (!localPath) throw new Error('cloud.downloadFile returned empty path')
  return localPath
}

// 腾讯云 ASR 一句话识别（≤60秒，≤1MB）
async function recognizeOneShot(filePath, voiceFormat) {
  const client = initASRClient()
  if (!client) {
    // SDK 没装或密钥没配
    if (!getSDK()) throw new Error('tencentcloud-sdk-nodejs 未安装，请先云端安装依赖')
    throw new Error('腾讯云 SecretId/SecretKey 未配置，请在云开发控制台新增环境变量')
  }

  const audioBuf = fs.readFileSync(filePath)
  if (audioBuf.length > 1024 * 1024) {
    throw new Error('音频超过 1MB（一句话识别上限），请控制在 60 秒以内')
  }

  const params = {
    VoiceBase64: audioBuf.toString('base64'),
    VoiceFormat: mapVoiceFormat(voiceFormat),
    EngineModelType: '16k_zh',
    SubServiceType: 0,     // 0: 通用场景
    UsrAudioKey: `tp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    FilterDirty: 1,        // 脏词过滤
    ConvertNumMode: 1,     // 阿拉伯数字
    WordInfo: 0
  }

  const resp = await client.RecognizeTask(params)
  if (!resp || resp.Code !== 0) {
    throw new Error((resp && resp.Message) || 'ASR 返回空结果')
  }

  const list = resp.FlashResult || []
  // FlashResult 里每个元素都有 Text 字段，通常只有一个
  const text = list.map(r => r.Text).join('')
  return text || ''
}

exports.main = async event => {
  const fileID = event && event.fileID
  const voiceFormat = event && event.format || 'mp3'
  const timeout = Math.min(Number(event && event.timeout) || 30, 60)

  if (!fileID) {
    return { ok: false, error: '缺少 fileID' }
  }

  try {
    const localPath = await downloadFromCloud(fileID)
    const text = await recognizeOneShot(localPath, voiceFormat)
    return { ok: true, text }
  } catch (e) {
    return {
      ok: false,
      error: e && (e.msg || e.message) || String(e)
    }
  }
}
