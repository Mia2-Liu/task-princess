import { reactive } from 'vue'
import { markDirty } from './dirty'

const STORAGE_KEY = 'tp_categories_v1'

const PALETTE = [
  '#f4a6c0',
  '#7c9ff0',
  '#f0b46c',
  '#6fc7b4',
  '#a58cf0',
  '#f08c8c',
  '#89c47a',
  '#7fb6d9'
]

const SEED = [
  { id: 'c_erbao', name: '二宝', color: PALETTE[0] },
  { id: 'c_dabao', name: '大宝', color: PALETTE[1] },
  { id: 'c_school', name: '学校', color: PALETTE[2] },
  { id: 'c_work', name: '工作', color: PALETTE[3] },
  { id: 'c_self', name: '自己', color: PALETTE[4] }
]

// 分类名 -> 常见说法，语音里提到这些词也会自动归到该类
const KEYWORDS = {
  二宝: ['老二', '妹妹', '弟弟', '幼儿园'],
  大宝: ['老大', '哥哥', '姐姐'],
  学校: ['老师', '班主任', '家长会', '班级群', '家委会', '校方'],
  工作: ['知乎', '公众号', '小红书', '选题', '商务', '客户', '甲方', '稿子', '写稿', '视频', '剪辑', '直播'],
  自己: ['看书', '读书', '健身', '运动']
}

export const categoryState = reactive({
  list: []
})

export function loadCategories() {
  try {
    const raw = uni.getStorageSync(STORAGE_KEY)
    if (Array.isArray(raw) && raw.length) {
      categoryState.list = raw
      return
    }
  } catch (e) {
    // 读取失败时回退到内置分类
  }
  categoryState.list = SEED.map(item => ({ ...item }))
  saveCategories()
}

export function saveCategories() {
  try {
    uni.setStorageSync(STORAGE_KEY, categoryState.list)
  } catch (e) {
    // 本地存储失败时保持内存态可用
  }
  markDirty()
}

export function applyRemoteCategories(list) {
  categoryState.list = Array.isArray(list) && list.length ? list : SEED.map(item => ({ ...item }))
}

export function getCategory(id) {
  if (!id) return null
  return categoryState.list.find(c => c.id === id) || null
}

export function categoryName(id) {
  const hit = getCategory(id)
  return hit ? hit.name : ''
}

export function categoryColor(id) {
  const hit = getCategory(id)
  return hit ? hit.color : '#b0aac2'
}

export function addCategory(name) {
  const value = String(name || '').trim().slice(0, 12)
  if (!value) return null
  if (categoryState.list.some(c => c.name === value)) return null
  const category = {
    id: 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name: value,
    color: PALETTE[categoryState.list.length % PALETTE.length]
  }
  categoryState.list.push(category)
  saveCategories()
  return category
}

export function renameCategory(id, name) {
  const value = String(name || '').trim().slice(0, 12)
  const target = getCategory(id)
  if (!target || !value) return false
  target.name = value
  saveCategories()
  return true
}

export function removeCategory(id) {
  const idx = categoryState.list.findIndex(c => c.id === id)
  if (idx < 0) return false
  categoryState.list.splice(idx, 1)
  saveCategories()
  return true
}

export function hexToRgba(hex, alpha = 0.12) {
  const value = String(hex || '').replace('#', '')
  if (value.length !== 6) return `rgba(176, 170, 194, ${alpha})`
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 从一句话里识别归属分类。
 * 优先匹配分类名本身，其次匹配该类配置的常见说法。
 */
export function matchCategory(text) {
  const raw = String(text || '')
  if (!raw || !categoryState.list.length) return null

  let best = null
  categoryState.list.forEach(category => {
    const candidates = [category.name, ...(KEYWORDS[category.name] || [])]
    candidates.forEach(word => {
      const index = raw.indexOf(word)
      if (index >= 0 && (!best || index < best.index)) {
        best = { id: category.id, index, word }
      }
    })
  })

  if (!best) return null

  let cleaned = raw
  // 只在「二宝的手工作业」这种带「的」的结构里去掉称呼，
  // 避免把「学校发的通知」削成「发的通知」
  const lead = new RegExp(`^${escapeRegExp(best.word)}\\s*的\\s*`)
  const stripped = raw.replace(lead, '').trim()
  if (best.index === 0 && stripped && stripped !== raw) cleaned = stripped

  return { categoryId: best.id, text: cleaned }
}
