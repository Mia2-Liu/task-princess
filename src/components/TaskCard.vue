<template>
  <view class="task-card" :class="cardClass" @longpress="onDelete(task)">
    <view class="task-head">
      <view class="check" :class="checkClass" @click.stop="toggleDone(task.id)">
        <text v-if="isDone" class="check-mark">✓</text>
      </view>

      <view class="task-body" @click="onBodyTap">
        <view class="title-row">
          <text class="task-title" :class="{ 'line-through': isDone }">{{ task.title }}</text>
          <text v-if="priorityTag" class="p-tag" :class="'p' + priority">{{ priorityTag }}</text>
          <text v-if="statusBadge" class="s-tag" :class="'s-' + task.status">{{ statusBadge }}</text>
        </view>
        <view class="meta-row">
          <text
            v-if="category"
            class="cat-tag"
            :style="{ background: tint, color: category.color }"
          >{{ category.name }}</text>
          <text v-if="due.label !== '无截止'" class="due" :class="due.tone">{{ due.label }}</text>
          <text v-if="isGroup" class="meta-text">{{ doneCount }}/{{ children.length }} 子任务</text>
          <text v-if="sourceTag" class="meta-text">{{ sourceTag }}</text>
        </view>
      </view>

      <view v-if="isGroup" class="chevron" :class="{ open: expanded }" @click.stop="expanded = !expanded">
        <text>⌄</text>
      </view>

      <!-- 状态快捷按钮：点 checkmark 旁边的小点，弹出状态选择 -->
      <view class="quick-status" @click.stop="showStatusPicker(task)">
        <view class="dot" :class="'dot-' + task.status"></view>
      </view>
    </view>

    <view v-if="isGroup && expanded" class="subs">
      <view v-for="child in children" :key="child.id" class="sub-row" @longpress.stop="onDelete(child)">
        <view class="check small" :class="{ done: isDoneOf(child) }" @click.stop="toggleDone(child.id)">
          <text v-if="isDoneOf(child)" class="check-mark">✓</text>
        </view>
        <text class="sub-title" :class="{ 'line-through': isDoneOf(child) }" @click.stop="toggleDone(child.id)">
          {{ child.title }}
        </text>
        <text v-if="childCat(child)" class="sub-cat" :style="childCatStyle(child)">
          {{ childCat(child).name }}
        </text>
        <text v-if="child.dueAt" class="sub-due" :class="childDue(child).tone">
          {{ childDue(child).label }}
        </text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import {
  childrenOf,
  toggleTask,
  setTaskStatus,
  removeTask,
  effectiveDue,
  effectivePriority,
  dueAllDayOf,
  STATUS,
  STATUS_LABEL
} from '@/store/tasks'
import { dueMeta } from '@/utils/date'
import { getCategory, hexToRgba } from '@/store/categories'

const props = defineProps({
  task: { type: Object, required: true }
})

const expanded = ref(true)
const children = computed(() => childrenOf(props.task.id))
const isGroup = computed(() => children.value.length > 0)
const isDone = computed(() => props.task.status === STATUS.DONE)
const isPaused = computed(() => props.task.status === STATUS.PAUSED)
const isActive = computed(() => props.task.status === STATUS.ACTIVE)
const doneCount = computed(() => children.value.filter(c => c.status === STATUS.DONE).length)

const cardClass = computed(() => ({
  'is-done': isDone.value,
  'is-paused': isPaused.value,
  'is-active': isActive.value
}))

const statusBadge = computed(() => {
  if (isDone.value) return '已完成'
  if (isPaused.value) return '暂停'
  if (isActive.value) return '进行中'
  return ''
})

const due = computed(() => dueMeta(effectiveDue(props.task), dueAllDayOf(props.task)))
const category = computed(() => getCategory(props.task.categoryId))
const tint = computed(() => hexToRgba(category.value ? category.value.color : '', 0.14))
const priority = computed(() => effectivePriority(props.task))
const priorityTag = computed(() =>
  priority.value === 2 ? '重要' : priority.value === 0 ? '不急' : ''
)
const sourceTag = computed(() =>
  props.task.source === 'voice' ? '语音' : props.task.source === 'doc' ? '文档' : ''
)
const checkClass = computed(() => {
  if (isDone.value) return 'done'
  if (isPaused.value) return 'paused'
  if (isGroup.value && doneCount.value > 0) return 'partial'
  return ''
})

function isDoneOf(child) { return child.status === STATUS.DONE }

function toggleDone(id) {
  toggleTask(id)  // 仍支持：pending→done, done→pending
}

function showStatusPicker(t) {
  uni.showActionSheet({
    itemList: ['标记完成', '开始进行中', '暂停', '恢复待办'],
    success: res => {
      const map = [STATUS.DONE, STATUS.ACTIVE, STATUS.PAUSED, STATUS.PENDING]
      setTaskStatus(t.id, map[res.tapIndex])
    }
  })
}

function onBodyTap() {
  if (isGroup.value) expanded.value = !expanded.value
}

function childDue(child) {
  return dueMeta(child.dueAt, child.dueAllDay)
}

function childCat(child) {
  return getCategory(child.categoryId)
}

function childCatStyle(child) {
  const hit = childCat(child)
  if (!hit) return {}
  return { color: hit.color, background: hexToRgba(hit.color, 0.14) }
}

function onDelete(t) {
  const isParent = childrenOf(t.id).length > 0
  uni.showModal({
    title: '删除任务',
    content: isParent ? `会同时删除 ${childrenOf(t.id).length} 个子任务` : '删除后不可恢复',
    confirmColor: '#ff6b81',
    success: res => { if (res.confirm) removeTask(t.id) }
  })
}
</script>

<style lang="scss" scoped>
.task-card {
  background: #ffffff;
  border-radius: 28rpx;
  padding: 26rpx;
  margin-bottom: 20rpx;
  border: 1rpx solid rgba(124, 108, 240, 0.06);
  box-shadow: 0 12rpx 30rpx rgba(85, 70, 150, 0.06);
  transition: transform 0.15s ease;

  &.is-done {
    background: rgba(255, 255, 255, 0.6);
    opacity: 0.85;
  }

  &.is-paused {
    background: #f9f7fb;
    border-color: rgba(174, 164, 200, 0.2);
  }

  &.is-active {
    border-color: rgba(124, 108, 240, 0.22);
  }
}

.task-head {
  display: flex;
  align-items: flex-start;
}

.check {
  width: 44rpx;
  height: 44rpx;
  border-radius: 50%;
  border: 2rpx solid #d9d4ea;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2rpx;
  transition: all 0.2s ease;

  &.done {
    background: linear-gradient(135deg, #7c6cf0, #b49cff);
    border-color: transparent;
  }

  &.partial {
    background: #efeaff;
    border-color: #b9a9ff;
  }

  &.paused {
    background: #f0eef7;
    border-color: #c6bcd8;
  }

  &.small {
    width: 34rpx;
    height: 34rpx;
    margin-top: 0;
  }
}

.check-mark {
  color: #ffffff;
  font-size: 24rpx;
  line-height: 1;
  font-weight: 700;
}

.quick-status {
  width: 40rpx;
  height: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2rpx;
  margin-left: 6rpx;

  .dot {
    width: 14rpx;
    height: 14rpx;
    border-radius: 50%;
    background: #d9d4ea;
    transition: background 0.2s;

    &.dot-done { background: #7c6cf0; }
    &.dot-active { background: #ff8c5a; }
    &.dot-paused { background: #b0aac2; }
    &.dot-pending { background: #d9d4ea; }
  }
}

.task-body {
  flex: 1;
  min-width: 0;
  padding: 0 16rpx;
}

.title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8rpx;
}

.task-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #2b2540;
  line-height: 1.45;
  word-break: break-all;
}

.line-through {
  text-decoration: line-through;
  color: #a9a2bd;
}

.p-tag {
  font-size: 19rpx;
  padding: 2rpx 10rpx;
  border-radius: 8rpx;
  line-height: 1.6;

  &.p2 { color: #e04a63; background: #ffe9ed; }
  &.p0 { color: #8e87a6; background: #f0eef7; }
}

.s-tag {
  font-size: 18rpx;
  padding: 2rpx 10rpx;
  border-radius: 8rpx;
  line-height: 1.6;
  font-weight: 500;

  &.s-done { color: #7c6cf0; background: #efeaff; }
  &.s-active { color: #ff8c5a; background: #fff0e8; }
  &.s-paused { color: #8e87a6; background: #f0eef7; }
}

.meta-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 8rpx;
}

.cat-tag {
  font-size: 20rpx;
  padding: 2rpx 12rpx;
  border-radius: 8rpx;
  margin-right: 14rpx;
  line-height: 1.7;
  font-weight: 600;
}

.due {
  font-size: 22rpx;
  margin-right: 14rpx;
  color: #8e87a6;

  &.overdue { color: #ff5f76; font-weight: 600; }
  &.today { color: #f09a3e; font-weight: 600; }
  &.tomorrow { color: #7c6cf0; }
}

.meta-text {
  font-size: 22rpx;
  color: #b0aac2;
  margin-right: 14rpx;
}

.chevron {
  width: 40rpx;
  height: 40rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #b0aac2;
  font-size: 30rpx;
  transition: transform 0.2s ease;

  &.open { transform: rotate(180deg); }
}

.subs {
  margin-top: 18rpx;
  padding-top: 8rpx;
  border-top: 1rpx dashed #edeaf7;
  padding-left: 12rpx;
}

.sub-row {
  display: flex;
  align-items: center;
  padding: 14rpx 0;
}

.sub-title {
  flex: 1;
  min-width: 0;
  font-size: 26rpx;
  color: #4a4363;
  margin-left: 16rpx;
  line-height: 1.4;
  word-break: break-all;
}

.sub-cat {
  font-size: 19rpx;
  padding: 2rpx 10rpx;
  border-radius: 8rpx;
  margin-left: 12rpx;
  font-weight: 600;
  flex-shrink: 0;
}

.sub-due {
  font-size: 20rpx;
  color: #b0aac2;
  margin-left: 12rpx;
  flex-shrink: 0;

  &.overdue { color: #ff5f76; }
  &.today { color: #f09a3e; }
}
</style>
