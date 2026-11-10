const DAY = 24 * 60 * 60 * 1000
export const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export function startOfDay(ts = Date.now()) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function endOfDay(ts = Date.now()) {
  const d = new Date(ts)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

export function addDays(ts, n) {
  const d = new Date(ts)
  d.setDate(d.getDate() + n)
  return d.getTime()
}

export function isSameDay(a, b) {
  return startOfDay(a) === startOfDay(b)
}

export function formatClock(ts) {
  const d = new Date(ts)
  return `${d.getHours() < 10 ? '0' : ''}${d.getHours()}:${
    d.getMinutes() < 10 ? '0' : ''
  }${d.getMinutes()}`
}

export function shortDate(ts) {
  const d = new Date(ts)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export function dayLabel(ts, now = Date.now()) {
  const diff = Math.round((startOfDay(ts) - startOfDay(now)) / DAY)
  if (diff === 0) return '今天'
  if (diff === 1) return '明天'
  if (diff === 2) return '后天'
  if (diff === -1) return '昨天'
  if (diff > 2 && diff < 7) return WEEKDAYS[new Date(ts).getDay()]
  return shortDate(ts)
}

export function formatFullDate(now = Date.now()) {
  const d = new Date(now)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]}`
}

export function greeting(now = Date.now()) {
  const h = new Date(now).getHours()
  if (h < 6) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

export function dueMeta(dueAt, dueAllDay = false, now = Date.now()) {
  if (!dueAt) {
    return { label: '无截止', tone: 'none' }
  }
  const time = dueAllDay ? '' : ` ${formatClock(dueAt)}`
  if (dueAt < now) {
    return {
      label: `${shortDate(dueAt)}${time} · 已逾期`,
      tone: 'overdue'
    }
  }
  const diff = Math.round((startOfDay(dueAt) - startOfDay(now)) / DAY)
  if (diff === 0) return { label: `今天${time}`, tone: 'today' }
  if (diff === 1) return { label: `明天${time}`, tone: 'tomorrow' }
  if (diff > 1 && diff < 7) {
    return { label: `${WEEKDAYS[new Date(dueAt).getDay()]}${time}`, tone: 'soon' }
  }
  return { label: `${shortDate(dueAt)}${time}`, tone: 'later' }
}
