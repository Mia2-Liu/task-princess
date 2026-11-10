import { unzipSync, strFromU8 } from 'fflate'
import { parseTimeHint, cleanTitle, detectPriority, decompose } from './decompose'
import { matchCategory } from '@/store/categories'

const TEXT_EXTS = ['txt', 'md', 'markdown', 'csv', 'json', 'log']

export const SUPPORTED_LABEL = '支持 txt / md / csv / xlsx / docx / 粘贴'
export const ACCEPT_ATTR = '.txt,.md,.markdown,.csv,.json,.log,.docx,.xlsx,.xls'

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
      if (!file) { reject(new Error('未选择文件')); return }
      try {
        const buffer = await file.arrayBuffer()
        resolve({ name: file.name, buffer })
      } catch (e) { reject(new Error('读取文件失败')) }
    }
    input.click()
    // #endif

    // #ifdef MP-WEIXIN
    wx.chooseMessageFile({
      count: 1, type: 'file',
      extension: ['txt', 'md', 'markdown', 'csv', 'json', 'log', 'docx', 'xlsx', 'xls'],
      success: res => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file) { reject(new Error('未选择文件')); return }
        try {
          const fs = wx.getFileSystemManager()
          fs.readFile({
            filePath: file.path,
            success: r => resolve({ name: file.name, buffer: r.data }),
            fail: () => reject(new Error('读取文件失败'))
          })
        } catch (e) { reject(new Error('读取文件失败')) }
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
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function extractDocx(buffer) {
  let files
  try { files = unzipSync(new Uint8Array(buffer)) }
  catch (e) { throw new Error('docx 文件解析失败，请确认文件未损坏') }
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

// --- 表格解析 ---

// 简单的 CSV parser（带引号处理）
function parseCsv(text, delim = ',') {
  const rows = []
  let cur = [], field = '', inQuote = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuote) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuote = false
      } else field += c
    } else {
      if (c === '"') inQuote = true
      else if (c === delim) { cur.push(field); field = '' }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++
        cur.push(field); field = ''
        rows.push(cur); cur = []
      } else field += c
    }
  }
  if (field || cur.length) { cur.push(field); rows.push(cur) }
  return rows.filter(r => r.some(c => String(c).trim() !== ''))
}

// 检测是否是表格：前 3 行里至少一行是分隔符，且有"任务/截止"类列标题
const HEADER_KEYWORDS = {
  title: ['任务', '事项', '内容', '主题', '标题', '描述', '事件', '任务名', '名称'],
  due: ['截止', '到期', '时间', '日期', 'deadline', 'ddl', '交', '提交', '期限', '完成日', '需要'],
  category: ['分类', '归属', '谁', '负责', '部门', '谁的', '给谁'],
  priority: ['重要', '优先级', 'priority', 'urgent', '紧急'],
  done: ['状态', '完成', 'done', 'status']
}

function detectTable(text) {
  if (!text) return null
  // 尝试 CSV（逗号）和 TSV（tab）两种
  for (const delim of ['\t', ',']) {
    const rows = parseCsv(text, delim)
    if (rows.length < 2) continue
    // 检查第一行是不是表头（匹配 title 或 due 关键词）
    const header = rows[0].map(c => String(c).trim().toLowerCase())
    let headerScore = 0
    let headerCols = {}
    for (let i = 0; i < header.length; i++) {
      const cell = header[i]
      for (const [col, kws] of Object.entries(HEADER_KEYWORDS)) {
        if (kws.some(kw => cell.includes(kw.toLowerCase()))) {
          headerScore++
          if (!headerCols[col]) headerCols[col] = i
        }
      }
    }
    // 至少识别到 2 个列头才算表格
    if (headerScore >= 2) {
      return { delim, headerCols, rows: rows.slice(1), header: rows[0] }
    }
  }
  return null
}

function parseTableRows(table, now = Date.now()) {
  const { headerCols, rows } = table
  const items = []
  const seen = new Set()

  for (const row of rows) {
    if (items.length >= 100) break
    // 跳过空行或表头重复
    const rowStr = row.join('').trim()
    if (!rowStr) continue

    // 取各列值
    const titleCol = headerCols.title !== undefined ? row[headerCols.title] : null
    const dueCol = headerCols.due !== undefined ? row[headerCols.due] : null
    const catCol = headerCols.category !== undefined ? row[headerCols.category] : null
    const priCol = headerCols.priority !== undefined ? row[headerCols.priority] : null
    const doneCol = headerCols.done !== undefined ? row[headerCols.done] : null

    // 标题优先取 title 列，否则把整行当标题
    let rawTitle = (titleCol || row[0] || '').trim()
    // 如果没有 due 列但有 category 列且 category 在最前面，可能整行是 "分类,任务,时间" 结构
    // 这种情况用整行当上下文，让 parseTimeHint 处理
    let dueText = dueCol ? String(dueCol).trim() : ''
    let catText = catCol ? String(catCol).trim() : ''

    // 如果有 category 列内容，直接用它匹配
    let categoryId = null
    if (catText) {
      // 构造一个临时字符串给 matchCategory："分类名的主题"
      const catMatch = matchCategory(catText + '的' + rawTitle)
      if (catMatch) categoryId = catMatch.categoryId
    }

    // 解析时间：优先用 due 列的值，否则标题里自带的时间让 decompose 处理
    let parsed = null
    if (dueText) {
      parsed = parseTimeHint(dueText, now)
    } else {
      parsed = parseTimeHint(rawTitle, now)
    }

    let finalTitle
    if (parsed.rest && parsed.rest.length >= 2) {
      finalTitle = parsed.rest
    } else {
      finalTitle = dueText ? rawTitle : rawTitle
    }
    finalTitle = cleanTitle(finalTitle) || rawTitle
    if (!finalTitle) continue

    const key = finalTitle + '|' + (parsed.dueAt || '')
    if (seen.has(key)) continue
    seen.add(key)

    // 优先级
    let priority = detectPriority(finalTitle)
    if (priCol) {
      const pc = String(priCol).trim()
      if (/(高|紧急|重要|urgent|2)/i.test(pc)) priority = 2
      else if (/(低|不急|可选|0|none|no)/i.test(pc)) priority = 0
      else if (/[1]/.test(pc)) priority = 1
    }

    // 状态
    let status = null
    if (doneCol) {
      const dc = String(doneCol).trim().toLowerCase()
      if (/(完成|已完成|done|✓|v|是|yes|true|1)/.test(dc)) status = 'done'
      else if (/(暂停|paused|暂停中)/.test(dc)) status = 'paused'
      else if (/(进行中|active|doing|in.?progress|进行)/.test(dc)) status = 'active'
    }

    items.push({
      title: finalTitle.slice(0, 100),
      dueAt: parsed.dueAt,
      dueAllDay: parsed.dueAllDay,
      priority,
      categoryId,
      status: status || null,
      _table: true
    })
  }

  return items
}

export function extractText(name, buffer) {
  const ext = (String(name).split('.').pop() || '').toLowerCase()
  if (TEXT_EXTS.includes(ext)) return decodeText(buffer)
  if (ext === 'docx') return extractDocx(buffer)
  if (ext === 'pdf') throw new Error('暂不支持直接读取 PDF，请复制文字后使用「粘贴导入」')
  if (ext === 'doc') throw new Error('旧版 .doc 暂不支持，请另存为 .docx 或粘贴文字')
  if (ext === 'xlsx' || ext === 'xls') {
    throw new Error('Excel 表格暂不支持直接解析，请先另存为 CSV 再导入')
  }
  throw new Error(`暂不支持 .${ext} 格式`)
}

export function parseTextToItems(text, now = Date.now()) {
  // --- 规则 1：表格优先 ---
  const table = detectTable(text)
  if (table) return parseTableRows(table, now)

  // --- 规则 2/3/4：按行 + 智能拆解 ---
  const lines = String(text || '').replace(/\r/g, '').split('\n')
  const items = []
  const seen = new Set()

  for (const rawLine of lines) {
    if (items.length >= 100) break
    const line = rawLine.trim()
    if (!line) continue
    if (/^#{1,6}\s/.test(line)) continue

    // 每行交给 decompose 处理（它内部跑 splitPhrases 规则链）
    const lineItems = decompose(line, now)
    for (const li of lineItems) {
      if (items.length >= 100) break
      const key = (li.categoryId || '') + '|' + li.title + '|' + (li.dueAt || '')
      if (seen.has(key)) continue
      seen.add(key)
      items.push(li)
    }
  }

  return items
}

