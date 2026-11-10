import { startOfDay, endOfDay, addDays } from './date'
import { matchCategory } from '@/store/categories'

const PERIOD_HOUR = {
  凌晨: 6,
  早上: 9,
  上午: 12,
  中午: 12,
  下午: 18,
  傍晚: 19,
  晚上: 21
}

const WEEKDAY_MAP = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 }

export function cleanTitle(input) {
  return String(input || '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s，,、；;。.!！?？:：\-—]+/, '')
    .replace(
      /^(?:然后|接着|最后|并且|同时|顺便|还有|以及|另外|再|先|请|帮我|帮忙|麻烦|记得|我要|我想|我需要|需要|要|把|去)+/,
      ''
    )
    .replace(/[\s，,、；;。.!！?？:：\-—]+$/, '')
    .trim()
}

export function detectPriority(text) {
  if (/(紧急|重要|必须|马上|立刻|尽快|加急|deadline|ddl)/i.test(text)) return 2
  if (/(不急|有空|可选|顺便|有时间)/.test(text)) return 0
  return 1
}

export function parseTimeHint(text, now = Date.now(), inheritedDate = null) {
  let rest = String(text || '')
  let dateTs = null
  let hasDate = false
  let period = null
  let explicitHour = null
  let explicitMinute = 0

  const rel = /(大后天|后天|明天|明早|明晚|今天|今晚|今早)/.exec(rest)
  if (rel) {
    const word = rel[1]
    let offset = 0
    if (word === '大后天') offset = 3
    else if (word === '后天') offset = 2
    else if (word.includes('明')) offset = 1
    dateTs = startOfDay(addDays(now, offset))
    hasDate = true
    if (word === '明早' || word === '今早') period = '早上'
    if (word === '明晚' || word === '今晚') period = '晚上'
    rest = rest.replace(rel[0], ' ')
  }

  if (!hasDate) {
    const wd = /(下)?(?:周|星期|礼拜)([一二三四五六日天])/.exec(rest)
    if (wd) {
      const target = WEEKDAY_MAP[wd[2]]
      const todayDow = new Date(now).getDay()
      let delta = (target - todayDow + 7) % 7
      if (delta === 0) delta = 7
      if (wd[1]) delta += 7
      dateTs = startOfDay(addDays(now, delta))
      hasDate = true
      rest = rest.replace(wd[0], ' ')
    }
  }

  if (!hasDate) {
    const edge = /(下个?月|这个?月|本?月)(底|末|初)/.exec(rest)
    if (edge) {
      const d = new Date(now)
      const isNext = edge[1].indexOf('下') === 0
      if (isNext) d.setMonth(d.getMonth() + 1, 1)
      if (edge[2] === '初') {
        d.setDate(1)
      } else {
        d.setMonth(d.getMonth() + 1, 0)
      }
      dateTs = startOfDay(d.getTime())
      hasDate = true
      rest = rest.replace(edge[0], ' ')
    }
  }

  if (!hasDate) {
    const md = /(?:(\d{4})年)?(\d{1,2})月(\d{1,2})[日号]?/.exec(rest)
    if (md) {
      const year = md[1] ? Number(md[1]) : new Date(now).getFullYear()
      const d = new Date(year, Number(md[2]) - 1, Number(md[3]))
      if (!md[1] && d.getTime() < startOfDay(now)) {
        d.setFullYear(year + 1)
      }
      dateTs = startOfDay(d.getTime())
      hasDate = true
      rest = rest.replace(md[0], ' ')
    }
  }

  const pm = /(凌晨|早上|上午|中午|下午|傍晚|晚上)/.exec(rest)
  if (pm) {
    period = pm[1]
    rest = rest.replace(pm[0], ' ')
  }

  const colon = /(\d{1,2}):(\d{2})/.exec(rest)
  if (colon) {
    let h = Number(colon[1])
    const m = Number(colon[2])
    if (period && ['下午', '傍晚', '晚上'].includes(period) && h < 12) h += 12
    else if (period === '凌晨' && h === 12) h = 0
    explicitHour = h
    explicitMinute = m
    rest = rest.replace(colon[0], ' ')
  } else {
    const hm = /(\d{1,2})\s*[点时](?:\s*(\d{1,2})\s*分?|\s*(半))?/.exec(rest)
    if (hm) {
      let h = Number(hm[1])
      const m = hm[2] ? Number(hm[2]) : hm[3] ? 30 : 0
      if (period && ['下午', '傍晚', '晚上'].includes(period) && h < 12) h += 12
      else if (period === '凌晨' && h === 12) h = 0
      explicitHour = h
      explicitMinute = m
      rest = rest.replace(hm[0], ' ')
    }
  }

  const hasTime = hasDate || period || explicitHour !== null
  const base = dateTs !== null ? dateTs : inheritedDate !== null ? startOfDay(inheritedDate) : null

  let dueAt = null
  let dueAllDay = false
  if (hasTime) {
    const d = new Date(base !== null ? base : startOfDay(now))
    if (explicitHour !== null) {
      d.setHours(explicitHour, explicitMinute, 0, 0)
      dueAt = d.getTime()
    } else if (period) {
      d.setHours(PERIOD_HOUR[period] || 18, 0, 0, 0)
      dueAt = d.getTime()
    } else {
      dueAt = endOfDay(d.getTime())
      dueAllDay = true
    }
  }

  return {
    rest: rest.replace(/\s+/g, ' ').trim(),
    dueAt,
    dueAllDay,
    hasDate,
    hasTime,
    dayStart: base !== null ? startOfDay(base) : null
  }
}

// ========== 拆分规则 v2 ==========
// 按优先级依次尝试：编号列表 → 连接词/标点 → 时间锚点 → 兜底
// 详细规则见项目根目录 SPLIT_RULES.md

const CONNECTOR_RE = /(然后|接着|最后|并且|同时|顺便|还有|以及|另外|再)/g
const STRONG_PUNCT_RE = /[。；;！!？?]/g  // 强标点：拆
const SOFT_PUNCT_RE = /[，,]/g           // 软标点：不拆，除非后面跟时间锚点

// 时间锚点正则：判断一段开头是不是时间表达（逗号后如果是时间，应该独立成一条）
const TIME_ANCHOR_RE = /^(?:(?:大后天|后天|明天|明早|明晚|今天|今晚|今早)|(?:下|上)?(?:周|星期|礼拜)[一二三四五六日天]|(?:\d{4}年)?\d{1,2}月\d{1,2}[日号]?|[下下?]?[个]?(?:月)(?:底|末|初)|(?:下午|上午|晚上|早上|中午|凌晨)\d{1,2}[点时](?:半|\d{1,2}分?)?|\d{1,2}:\d{2}|\d{1,2}[点时](?:半|\d{1,2}分?)?)/

// 编号识别
const NUMBERED_ITEM_RE = /^(?:\d{1,2}[.、)）]|(?:[一二三四五六七八九十]+)[、.]|[-*•·●○◆◇])\s*/

export function splitPhrases(text) {
  let t = String(text || '').replace(/\r/g, '\n').trim()
  if (!t) return []

  // --- 规则 2：编号列表 ---
  // 先把带编号的行变成一行一项
  const numberedLines = []
  const lines = t.split('\n')
  for (let line of lines) {
    line = line.trim()
    if (!line) continue
    // 如果行开头是编号
    const numMatch = NUMBERED_ITEM_RE.exec(line)
    if (numMatch) {
      numberedLines.push(line.slice(numMatch[0].length).trim())
    } else {
      // 没编号的行，如果上一个也是没编号的（编号项结束了），作为新项；
      // 如果上一个是编号项，合并到上一行末尾（同一条的续行）
      numberedLines.push(line)
    }
  }

  // --- 规则 3：连接词 + 标点 ---
  // 把连接词和强标点都换成统一分隔符 \n，软标点保留
  let joined = numberedLines.join('\n')
  joined = joined.replace(STRONG_PUNCT_RE, '\n')
  joined = joined.replace(CONNECTOR_RE, '\n')
  joined = joined.replace(/\n+/g, '\n')

  let rawPieces = joined.split('\n').map(s => s.trim()).filter(s => s.length >= 2)

  // --- 规则 4：时间锚点独立 ---
  // 某段里如果有多个独立时间表达，按时间位置拆分
  // 但这一步在 decompose() 里 parseTimeHint 已经逐段处理了，
  // 这里只做初步。更重要的是：
  // 如果一条里逗号很多且每个逗号后都跟着时间锚点，那每个逗号后单独拆
  const finalPieces = []
  for (let piece of rawPieces) {
    // 检查是否"逗号 + 时间锚点"模式
    if (/[,，]/.test(piece) && piece.split(/[,，]/).every(seg => seg.trim().length >= 4)) {
      const parts = piece.split(/[,，]/).map(s => s.trim()).filter(s => s.length >= 4)
      // 每个 part 里如果自己还带连接词，再拆
      for (let p of parts) {
        let further = p.replace(CONNECTOR_RE, '\n').split('\n').map(s => s.trim()).filter(Boolean)
        for (let f of further) finalPieces.push(f)
      }
    } else {
      finalPieces.push(piece)
    }
  }

  // --- 合并短片段（避免噪声）---
  const merged = []
  for (let p of finalPieces) {
    if (p.length < 4 && merged.length > 0) {
      merged[merged.length - 1] = merged[merged.length - 1] + '，' + p
    } else {
      merged.push(p)
    }
  }

  // --- 规则 5：兜底 ---
  if (!merged.length) {
    return [t]
  }

  return merged
}

export function decompose(text, now = Date.now()) {
  const phrases = splitPhrases(text)
  const items = []
  let lastDate = null
  let lastCategory = null

  phrases.slice(0, 20).forEach(phrase => {
    const cat = matchCategory(phrase)
    const parsed = parseTimeHint(cat ? cat.text : phrase, now, lastDate)
    if (parsed.hasDate) lastDate = parsed.dayStart
    const categoryId = cat ? cat.categoryId : lastCategory
    if (cat) lastCategory = cat.categoryId
    const title = cleanTitle(parsed.rest)
    if (!title) return
    const item = {
      title: title.slice(0, 100),
      dueAt: parsed.dueAt,
      dueAllDay: parsed.dueAllDay,
      priority: detectPriority(phrase),
      categoryId
    }
    if (!items.some(i => i.title === item.title)) items.push(item)
  })

  if (!items.length) {
    const cat = matchCategory(text)
    const title = cleanTitle(cat ? cat.text : text)
    if (title) {
      items.push({
        title: title.slice(0, 100),
        dueAt: null,
        dueAllDay: false,
        priority: detectPriority(text),
        categoryId: cat ? cat.categoryId : null
      })
    }
  }

  return items
}
