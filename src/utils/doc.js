import { unzipSync, strFromU8 } from 'fflate'
import { parseTimeHint, cleanTitle, detectPriority } from './decompose'

const TEXT_EXTS = ['txt', 'md', 'markdown', 'csv', 'json', 'log']

export const SUPPORTED_LABEL = '支持 txt / md / csv / json / docx'
export const ACCEPT_ATTR = '.txt,.md,.markdown,.csv,.json,.log,.docx'

export function chooseDocument() {
  return new Promise((resolve, reject) => {
    // #ifdef H5
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = ACCEPT_ATTR
    input.style.display = 'none'
    document.body.appendChild(input)
    input.onchange = async () => {
      const file = input.files && input.files[0]
      document.body.removeChild(input)
      if (!file) {
        reject(new Error('未选择文件'))
        return
      }
      try {
        const buffer = await file.arrayBuffer()
        resolve({ name: file.name, buffer })
      } catch (e) {
        reject(new Error('读取文件失败'))
      }
    }
    input.click()
    // #endif

    // #ifdef MP-WEIXIN
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['txt', 'md', 'markdown', 'csv', 'json', 'log', 'docx'],
      success: res => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file) {
          reject(new Error('未选择文件'))
          return
        }
        try {
          const fs = wx.getFileSystemManager()
          fs.readFile({
            filePath: file.path,
            success: r => resolve({ name: file.name, buffer: r.data }),
            fail: () => reject(new Error('读取文件失败'))
          })
        } catch (e) {
          reject(new Error('读取文件失败'))
        }
      },
      fail: () => reject(new Error('未选择文件'))
    })
    // #endif

    // #ifndef H5 || MP-WEIXIN
    reject(new Error('当前端暂不支持选择文档，可使用粘贴导入'))
    // #endif
  })
}

function decodeText(buffer) {
  const bytes = new Uint8Array(buffer)
  let text = strFromU8(bytes)
  text = text.replace(/^\uFEFF/, '')
  const bad = (text.match(/\uFFFD/g) || []).length
  if (text.length > 20 && bad / text.length > 0.02) {
    throw new Error('文件编码可能不是 UTF-8，请另存为 UTF-8 后重试')
  }
  return text
}

function decodeEntities(str) {
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function extractDocx(buffer) {
  let files
  try {
    files = unzipSync(new Uint8Array(buffer))
  } catch (e) {
    throw new Error('docx 文件解析失败，请确认文件未损坏')
  }
  const entry = files['word/document.xml']
  if (!entry) throw new Error('未找到 docx 正文内容')
  const xml = decodeEntities(
    strFromU8(entry)
      .replace(/<w:tab[^>]*\/>/g, '\t')
      .replace(/<w:br[^>]*\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, '')
  )
  return xml.replace(/\n{3,}/g, '\n\n').trim()
}

export function extractText(name, buffer) {
  const ext = (String(name).split('.').pop() || '').toLowerCase()
  if (TEXT_EXTS.includes(ext)) return decodeText(buffer)
  if (ext === 'docx') return extractDocx(buffer)
  if (ext === 'pdf') {
    throw new Error('暂不支持直接读取 PDF，请复制文字后使用「粘贴导入」')
  }
  if (ext === 'doc') {
    throw new Error('旧版 .doc 暂不支持，请另存为 .docx 或粘贴文字')
  }
  throw new Error(`暂不支持 .${ext} 格式`)
}

export function parseTextToItems(text, now = Date.now()) {
  const lines = String(text || '').replace(/\r/g, '').split('\n')
  const items = []
  const seen = new Set()
  let lastDate = null

  for (const rawLine of lines) {
    if (items.length >= 100) break
    const line = rawLine
      .replace(/^\s*(?:[-*•·]|\d{1,3}[.、)）]|[（(]\d{1,3}[)）])\s*/, '')
      .trim()
    if (!line) continue
    if (/^#{1,6}\s/.test(line)) continue

    const pieces =
      line.length > 60
        ? line
            .split(/[。；;]/)
            .map(s => s.trim())
            .filter(Boolean)
        : [line]

    for (const piece of pieces) {
      if (items.length >= 100) break
      if (piece.length < 2) continue
      const key = piece.slice(0, 60)
      if (seen.has(key)) continue
      seen.add(key)

      const parsed = parseTimeHint(piece, now, lastDate)
      if (parsed.hasDate) lastDate = parsed.dayStart
      const title = cleanTitle(parsed.rest) || cleanTitle(piece)
      if (!title) continue

      items.push({
        title: title.slice(0, 100),
        dueAt: parsed.dueAt,
        dueAllDay: parsed.dueAllDay,
        priority: detectPriority(piece)
      })
    }
  }

  return items
}
