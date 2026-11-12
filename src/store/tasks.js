import { reactive } from 'vue'
import { endOfDay, isSameDay } from '@/utils/date'
import { markDirty } from './dirty'

const STORAGE_KEY = 'tp_tasks_v1'

export const STATUS = {
  PENDING: 'pending',   // 未开始（默认）
  ACTIVE: 'active',     // 进行中
  PAUSED: 'paused',     // 暂停
  DONE: 'done'          // 已完成
}

export const STATUS_LABEL = {
  pending: '未开始',
  active: '进行中',
  paused: '暂停',
  done: '已完成'
}

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
  return topTasks().filter(t => t.status !== STATUS.DONE && t.categoryId === categoryId).length
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
    status: data.status || STATUS.PENDING,
    doneAt: data.status === STATUS.DONE ? Date.now() : null,
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
    status: STATUS.PENDING,
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
      status: STATUS.PENDING,
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

export function updateTask(id, patch = {}) {
  const task = getTask(id)
  if (!task) return null
  if (patch.title !== undefined) {
    const title = String(patch.title || '').trim().slice(0, 100)
    if (title) task.title = title
  }
  if (patch.categoryId !== undefined) task.categoryId = patch.categoryId || null
  if (patch.dueAt !== undefined) {
    task.dueAt = patch.dueAt || null
    if (!task.dueAt) task.dueAllDay = false
  }
  if (patch.dueAllDay !== undefined) task.dueAllDay = !!patch.dueAllDay
  if (typeof patch.priority === 'number') task.priority = patch.priority
  task.updatedAt = Date.now()
  saveTasks()
  return task
}

function syncParent(parentId) {
  if (!parentId) return
  const parent = getTask(parentId)
  if (!parent) return
  const kids = childrenOf(parentId)
  if (!kids.length) return
  const allDone = kids.every(k => k.status === STATUS.DONE)
  parent.status = allDone ? STATUS.DONE : STATUS.ACTIVE
  parent.doneAt = allDone ? parent.doneAt || Date.now() : null
}

export function setTaskStatus(id, newStatus) {
  const task = getTask(id)
  if (!task) return
  if (!Object.values(STATUS).includes(newStatus)) return
  task.status = newStatus
  task.doneAt = newStatus === STATUS.DONE ? Date.now() : null
  // 有子任务时联动
  const kids = childrenOf(id)
  if (kids.length) {
    kids.forEach(kid => {
      kid.status = newStatus
      kid.doneAt = newStatus === STATUS.DONE ? Date.now() : null
    })
  }
  syncParent(task.parentId)
  saveTasks()
}

export function toggleTask(id) {
  // 兼容旧调用：pending/active/paused → done, done → pending
  const task = getTask(id)
  if (!task) return
  const next = task.status === STATUS.DONE ? STATUS.PENDING : STATUS.DONE
  setTaskStatus(id, next)
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
      parent.status = STATUS.PENDING
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
  return membersOf(task).filter(t => t.status !== STATUS.DONE)
}

export function effectiveDue(task) {
  const members = membersOf(task)
  const pending = members.filter(t => t.status !== STATUS.DONE)
  const list = pending.length ? pending : members
  const dues = list.map(t => t.dueAt).filter(Boolean)
  return dues.length ? Math.min(...dues) : null
}

export function effectivePriority(task) {
  const members = membersOf(task)
  const pending = members.filter(t => t.status !== STATUS.DONE)
  const list = pending.length ? pending : members
  return Math.max(...list.map(t => (typeof t.priority === 'number' ? t.priority : 1)))
}

export function dueAllDayOf(task) {
  const members = membersOf(task)
  const pending = members.filter(t => t.status !== STATUS.DONE)
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
  return task.status === STATUS.DONE
}

export function filterByStatus(list, status) {
  if (!status || status === 'all') return list
  if (status === 'active') return list.filter(t => t.status === STATUS.ACTIVE || t.status === STATUS.PENDING)
  if (status === 'paused') return list.filter(t => t.status === STATUS.PAUSED)
  if (status === 'done') return list.filter(t => t.status === STATUS.DONE)
  return list
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
  const doneToday = tops.filter(t => t.status === STATUS.DONE && t.doneAt && isSameDay(t.doneAt, now))
  const total = pendingToday.length + doneToday.length
  return {
    todayPending: pendingToday.length,
    doneToday: doneToday.length,
    percent: total ? Math.round((doneToday.length / total) * 100) : 0,
    deadlineCount: tops.filter(t => t.status !== STATUS.DONE && hasDeadline(t)).length,
    allCount: tops.filter(t => t.status !== STATUS.DONE).length,
    doneCount: tops.filter(t => t.status === STATUS.DONE).length,
    activeCount: tops.filter(t => t.status === STATUS.ACTIVE).length,
    pausedCount: tops.filter(t => t.status === STATUS.PAUSED).length
  }
}

// 旧数据迁移：把 task.done 转成 task.status
export function migrateDoneToStatus() {
  let changed = false
  state.tasks.forEach(t => {
    if (typeof t.status === 'string' && Object.values(STATUS).includes(t.status)) return
    if (t.done === true) {
      t.status = STATUS.DONE
      changed = true
    } else {
      t.status = STATUS.PENDING
      changed = true
    }
    delete t.done
  })
  if (changed) saveTasks()
}
