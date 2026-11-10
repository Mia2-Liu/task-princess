import {
  state as taskState,
  applyRemoteTasks,
  saveTasks,
  loadTasks
} from './tasks'
import {
  categoryState,
  applyRemoteCategories,
  saveCategories,
  loadCategories
} from './categories'
import { onDirty } from './dirty'
import { callSync, isCloudEnabled } from '@/utils/cloud'

const SYNC_AT_KEY = 'tp_sync_at'

let started = false
let timer = null
let pushing = false

function localUpdatedAt() {
  try {
    return Number(uni.getStorageSync(SYNC_AT_KEY)) || 0
  } catch (e) {
    return 0
  }
}

function setLocalUpdatedAt(ts) {
  try {
    uni.setStorageSync(SYNC_AT_KEY, ts)
  } catch (e) {
    // 忽略本地写入失败
  }
}

function snapshot() {
  return {
    tasks: JSON.parse(JSON.stringify(taskState.tasks)),
    categories: JSON.parse(JSON.stringify(categoryState.list))
  }
}

export function scheduleSync() {
  if (!isCloudEnabled()) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    pushNow()
  }, 1200)
}

async function pushNow() {
  if (pushing) return
  pushing = true
  try {
    const updatedAt = Date.now()
    const { tasks, categories } = snapshot()
    const result = await callSync('push', { tasks, categories, updatedAt })
    if (result && result.ok) setLocalUpdatedAt(updatedAt)
  } catch (e) {
    // 网络异常时保留本地数据，下次改动会重试
  } finally {
    pushing = false
  }
}

export async function pullNow() {
  if (!isCloudEnabled()) return false
  try {
    const result = await callSync('pull')
    if (!result || !result.ok || !result.doc) return false
    if (!result.doc.updatedAt || result.doc.updatedAt <= localUpdatedAt()) return false

    applyRemoteCategories(result.doc.categories)
    applyRemoteTasks(result.doc.tasks)
    setLocalUpdatedAt(result.doc.updatedAt)
    saveCategories()
    saveTasks()
    return true
  } catch (e) {
    return false
  }
}

export function initSync() {
  if (started || !isCloudEnabled()) return
  started = true
  loadCategories()
  loadTasks()
  onDirty(scheduleSync)
  pullNow()
}
