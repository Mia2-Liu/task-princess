import { startOfDay, endOfDay, addDays } from './date'

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

export function splitPhrases(text) {
  let t = String(text || '').replace(/\r/g, '\n')
  t = t.replace(/(^|\n)\s*(?:\d{1,2}[.、)）]|[-*•·])\s*/g, '$1，')
  t = t.replace(/(^|[\s，,；;])\d{1,2}[.、)）]\s+/g, '$1，')
  t = t.replace(/(\d{1,2})、\s*/g, '，')
  t = t.replace(/[；;。!！?？]/g, '，')
  t = t.replace(/\n+/g, '，')
  t = t.replace(/(?:然后|接着|最后|并且|同时|顺便|还有|以及|另外)/g, '，')
  return t
    .split(/[，,]/)
    .map(s => s.trim())
    .filter(Boolean)
}

export function decompose(text, now = Date.now()) {
  const phrases = splitPhrases(text)
  const items = []
  let lastDate = null

  phrases.slice(0, 20).forEach(phrase => {
    const parsed = parseTimeHint(phrase, now, lastDate)
    if (parsed.hasDate) lastDate = parsed.dayStart
    const title = cleanTitle(parsed.rest)
    if (!title) return
    const item = {
      title: title.slice(0, 100),
      dueAt: parsed.dueAt,
      dueAllDay: parsed.dueAllDay,
      priority: detectPriority(phrase)
    }
    if (!items.some(i => i.title === item.title)) items.push(item)
  })

  if (!items.length) {
    const title = cleanTitle(text)
    if (title) {
      items.push({
        title: title.slice(0, 100),
        dueAt: null,
        dueAllDay: false,
        priority: detectPriority(text)
      })
    }
  }

  return items
}
