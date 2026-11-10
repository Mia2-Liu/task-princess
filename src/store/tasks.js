import { reactive } from 'vue'
import { endOfDay, isSameDay } from '@/utils/date'
import { markDirty } from './dirty'

const STORAGE_KEY = 'tp_tasks_v1'

export const state = reactive({
  tasks: []
})

export const uiState = reactive({
  tab: ''
})

export function requestTab(tab) {
  uiState.tab = tab
}

export function consumeTab() {
  const tab = uiState.tab
  uiState.tab = ''
  return tab
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function loadTasks() {
  try {
    const raw = uni.getStorageSync(STORAGE_KEY)
    state.tasks = Array.isArray(raw) ? raw : []
  } catch (e) {
    state.tasks = []
  }
}

export function saveTasks() {
  try {
    uni.setStorageSync(STORAGE_KEY, state.tasks)
  } catch (e) {
    // 本地存储失败时保持内存态可用
  }
  markDirty()
}

export function applyRemoteTasks(list) {
  state.tasks = Array.isArray(list) ? list : []
}

export function clearCategoryFromTasks(categoryId) {
  if (!categoryId) return
  state.tasks.forEach(task => {
    if (task.categoryId === categoryId) task.categoryId = null
  })
  saveTasks()
}

export function countByCategory(categoryId) {
  return topTasks().filter(t => !t.done && t.categoryId === categoryId).length
}

export function getTask(id) {
  return state.tasks.find(t => t.id === id) || null
}

export function childrenOf(id) {
  return state.tasks.filter(t => t.parentId === id)
}

export function topTasks() {
  return state.tasks.filter(t => !t.parentId)
}

export function addTask(data, parentId = null) {
  const task = {
    id: genId(),
    title: String(data.title || '').trim(),
    note: data.note || '',
    done: false,
    doneAt: null,
    createdAt: Date.now(),
    dueAt: data.dueAt || null,
    dueAllDay: !!data.dueAllDay,
    priority: typeof data.priority === 'number' ? data.priority : 1,
    parentId,
    categoryId: data.categoryId || null,
    source: data.source || 'manual'
  }
  state.tasks.push(task)
  if (parentId) syncParent(parentId)
  saveTasks()
  return task
}

export function addPlan(title, items, source = 'voice') {
  const valid = items.filter(i => String(i.title || '').trim())
  if (!valid.length) return null
  if (valid.length === 1) {
    return addTask({ ...valid[0], source }, null)
  }

  const dues = valid.map(i => i.dueAt).filter(Boolean)
  const sharedCategory = valid.every(i => i.categoryId === valid[0].categoryId)
    ? valid[0].categoryId || null
    : null
  const parent = {
    id: genId(),
    title: String(title || '新任务组').trim().slice(0, 100),
    note: '',
    done: false,
    doneAt: null,
    createdAt: Date.now(),
    dueAt: dues.length ? Math.min(...dues) : null,
    dueAllDay: dues.length
      ? valid.find(i => i.dueAt === Math.min(...dues))?.dueAllDay || false
      : false,
    priority: Math.max(...valid.map(i => (typeof i.priority === 'number' ? i.priority : 1))),
    parentId: null,
    categoryId: sharedCategory,
    source
  }
  state.tasks.push(parent)
  valid.forEach(item => {
    state.tasks.push({
      id: genId(),
      title: String(item.title).trim().slice(0, 100),
      note: '',
      done: false,
      doneAt: null,
      createdAt: Date.now(),
      dueAt: item.dueAt || null,
      dueAllDay: !!item.dueAllDay,
      priority: typeof item.priority === 'number' ? item.priority : 1,
      parentId: parent.id,
      categoryId: item.categoryId || null,
      source
    })
  })
  saveTasks()
  return parent
}

function syncParent(parentId) {
  if (!parentId) return
  const parent = getTask(parentId)
  if (!parent) return
  const kids = childrenOf(parentId)
  if (!kids.length) return
  const allDone = kids.every(k => k.done)
  parent.done = allDone
  parent.doneAt = allDone ? parent.doneAt || Date.now() : null
}

export function toggleTask(id) {
  const task = getTask(id)
  if (!task) return
  const next = !task.done
  const kids = childrenOf(id)
  if (kids.length) {
    kids.forEach(kid => {
      kid.done = next
      kid.doneAt = next ? Date.now() : null
    })
  }
  task.done = next
  task.doneAt = next ? Date.now() : null
  syncParent(task.parentId)
  saveTasks()
}

export function removeTask(id) {
  const task = getTask(id)
  if (!task) return
  const ids = new Set([id, ...childrenOf(id).map(t => t.id)])
  state.tasks = state.tasks.filter(t => !ids.has(t.id))
  if (task.parentId) {
    const parent = getTask(task.parentId)
    const siblings = childrenOf(task.parentId)
    if (parent && !siblings.length) {
      parent.done = false
      parent.doneAt = null
    } else {
      syncParent(task.parentId)
    }
  }
  saveTasks()
}

export function membersOf(task) {
  const kids = childrenOf(task.id)
  return kids.length ? kids : [task]
}

export function pendingMembersOf(task) {
  return membersOf(task).filter(t => !t.done)
}

export function effectiveDue(task) {
  const members = membersOf(task)
  const pending = members.filter(t => !t.done)
  const list = pending.length ? pending : members
  const dues = list.map(t => t.dueAt).filter(Boolean)
  return dues.length ? Math.min(...dues) : null
}

export function effectivePriority(task) {
  const members = membersOf(task)
  const pending = members.filter(t => !t.done)
  const list = pending.length ? pending : members
  return Math.max(...list.map(t => (typeof t.priority === 'number' ? t.priority : 1)))
}

export function dueAllDayOf(task) {
  const members = membersOf(task)
  const pending = members.filter(t => !t.done)
  const list = pending.length ? pending : members
  const due = effectiveDue(task)
  const hit = list.find(t => t.dueAt === due)
  return hit ? !!hit.dueAllDay : false
}

export function isToday(task, now = Date.now()) {
  const pending = pendingMembersOf(task)
  if (!pending.length) return false
  return pending.some(t => t.dueAt && t.dueAt <= endOfDay(now))
}

export function hasDeadline(task) {
  const pending = pendingMembersOf(task)
  return pending.some(t => !!t.dueAt)
}

export function isCompleted(task) {
  return task.done
}

export function sortByDue(list) {
  return [...list].sort((a, b) => {
    const da = effectiveDue(a)
    const db = effectiveDue(b)
    if (da && db && da !== db) return da - db
    if (da && !db) return -1
    if (!da && db) return 1
    const pa = effectivePriority(a)
    const pb = effectivePriority(b)
    if (pa !== pb) return pb - pa
    return a.createdAt - b.createdAt
  })
}

export function stats(now = Date.now()) {
  const tops = topTasks()
  const pendingToday = tops.filter(t => isToday(t, now))
  const doneToday = tops.filter(t => t.done && t.doneAt && isSameDay(t.doneAt, now))
  const total = pendingToday.length + doneToday.length
  return {
    todayPending: pendingToday.length,
    doneToday: doneToday.length,
    percent: total ? Math.round((doneToday.length / total) * 100) : 0,
    deadlineCount: tops.filter(t => !t.done && hasDeadline(t)).length,
    allCount: tops.filter(t => !t.done).length,
    doneCount: tops.filter(t => t.done).length
  }
}
