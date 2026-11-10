// 数据变更信号：tasks / categories 保存后通知同步模块
let handler = null

export function onDirty(fn) {
  handler = fn
}

export function markDirty() {
  if (handler) handler()
}
