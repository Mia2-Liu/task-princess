<template>
  <view class="task-card" :class="{ 'is-done': task.done }" @longpress="onDelete(task)">
    <view class="task-head">
      <view class="check" :class="checkClass" @click.stop="toggleTask(task.id)">
        <text v-if="task.done" class="check-mark">✓</text>
      </view>

      <view class="task-body" @click="onBodyTap">
        <view class="title-row">
          <text class="task-title" :class="{ 'line-through': task.done }">{{ task.title }}</text>
          <text v-if="priorityTag" class="p-tag" :class="'p' + priority">{{ priorityTag }}</text>
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
    </view>

    <view v-if="isGroup && expanded" class="subs">
      <view v-for="child in children" :key="child.id" class="sub-row" @longpress.stop="onDelete(child)">
        <view class="check small" :class="{ done: child.done }" @click.stop="toggleTask(child.id)">
          <text v-if="child.done" class="check-mark">✓</text>
        </view>
        <text class="sub-title" :class="{ 'line-through': child.done }" @click.stop="toggleTask(child.id)">
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
  removeTask,
  effectiveDue,
  effectivePriority,
  dueAllDayOf
} from '@/store/tasks'
import { dueMeta } from '@/utils/date'
import { getCategory, hexToRgba } from '@/store/categories'

const props = defineProps({
  task: {
    type: Object,
    required: true
  }
})

const expanded = ref(true)
const children = computed(() => childrenOf(props.task.id))
const isGroup = computed(() => children.value.length > 0)
const doneCount = computed(() => children.value.filter(c => c.done).length)

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
  if (props.task.done) return 'done'
  if (isGroup.value && doneCount.value > 0) return 'partial'
  return ''
})

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

function onDelete(task) {
  const isParent = childrenOf(task.id).length > 0
  uni.showModal({
    title: '删除任务',
    content: isParent ? `会同时删除 ${childrenOf(task.id).length} 个子任务` : '删除后不可恢复',
    confirmColor: '#ff6b81',
    success: res => {
      if (res.confirm) removeTask(task.id)
    }
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
    background: rgba(255, 255, 255, 0.72);
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

.task-body {
  flex: 1;
  min-width: 0;
  padding: 0 16rpx;
}

.title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
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
  margin-left: 10rpx;
  line-height: 1.6;

  &.p2 {
    color: #e04a63;
    background: #ffe9ed;
  }

  &.p0 {
    color: #8e87a6;
    background: #f0eef7;
  }
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

  &.overdue {
    color: #ff5f76;
    font-weight: 600;
  }

  &.today {
    color: #f09a3e;
    font-weight: 600;
  }

  &.tomorrow {
    color: #7c6cf0;
  }

  &.soon,
  &.later {
    color: #8e87a6;
  }
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

  &.open {
    transform: rotate(180deg);
  }
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

  &.overdue {
    color: #ff5f76;
  }

  &.today {
    color: #f09a3e;
  }
}
</style>
