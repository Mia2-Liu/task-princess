<template>
  <view class="page">
    <view class="hero">
      <view class="hero-head">
        <view class="hero-left">
          <view class="badge">任</view>
          <view class="hero-copy">
            <text class="greet">{{ greet }}</text>
            <text class="today">{{ todayText }}</text>
          </view>
        </view>
        <view class="import-link" @click="goImport">
          <text class="import-dot">＋</text>
          <text>导入</text>
        </view>
      </view>

      <view class="progress-card">
        <view class="progress-num-wrap">
          <text class="progress-num">{{ stat.percent }}</text>
          <text class="progress-unit">%</text>
          <text class="progress-label">今日进度</text>
        </view>
        <view class="progress-right">
          <view class="bar">
            <view class="bar-inner" :style="{ width: stat.percent + '%' }"></view>
          </view>
          <text class="progress-tip">
            已完成 {{ stat.doneToday }} 项 · 待完成 {{ stat.todayPending }} 项
          </text>
        </view>
      </view>
    </view>

    <scroll-view class="cat-bar" scroll-x :show-scrollbar="false">
      <view class="cat-row">
        <view
          class="cat-chip"
          :class="{ active: activeCategory === '' }"
          @click="activeCategory = ''"
        >全部</view>
        <view
          v-for="c in categories"
          :key="c.id"
          class="cat-chip"
          :class="{ active: activeCategory === c.id }"
          :style="chipStyle(c)"
          @click="activeCategory = c.id"
        >
          <view class="cat-dot" :style="{ background: activeCategory === c.id ? '#ffffff' : c.color }"></view>
          <text>{{ c.name }}</text>
          <text v-if="countOf(c.id)" class="cat-count">{{ countOf(c.id) }}</text>
        </view>
        <view class="cat-chip cat-manage" @click="goCategories">管理</view>
      </view>
    </scroll-view>

    <view class="tabs">
      <view
        v-for="tab in tabs"
        :key="tab.key"
        class="tab"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        <text>{{ tab.label }}</text>
        <text v-if="tab.count > 0" class="tab-count">{{ tab.count }}</text>
      </view>
    </view>

    <view class="list">
      <view v-if="!tasks.length" class="empty">
        <view class="empty-orb">任</view>
        <text class="empty-title">{{ emptyTitle }}</text>
        <text class="empty-sub">{{ emptySub }}</text>
        <view class="empty-btn" @click="goAdd">新建一个任务</view>
      </view>

      <view v-else class="task-list">
        <TaskCard v-for="task in tasks" :key="task.id" :task="task" />
      </view>

      <view class="list-space"></view>
    </view>

    <view class="fab" @click="goAdd">
      <text class="fab-plus">＋</text>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import TaskCard from '@/components/TaskCard.vue'
import {
  topTasks,
  isToday,
  hasDeadline,
  sortByDue,
  stats,
  consumeTab,
  countByCategory
} from '@/store/tasks'
import { categoryState, hexToRgba } from '@/store/categories'
import { greeting, formatFullDate } from '@/utils/date'

const activeTab = ref('today')
const activeCategory = ref('')

const categories = computed(() => categoryState.list)

const stat = computed(() => stats())
const greet = computed(() => greeting())
const todayText = computed(() => formatFullDate())

const tabs = computed(() => [
  { key: 'today', label: '今天', count: stat.value.todayPending },
  { key: 'deadline', label: '有截止', count: stat.value.deadlineCount },
  { key: 'all', label: '全部', count: stat.value.allCount },
  { key: 'done', label: '完成', count: stat.value.doneCount }
])

const emptyMap = {
  today: {
    title: '今天还没有任务',
    sub: '说一句或导一份文档，帮你安排得明明白白'
  },
  deadline: {
    title: '暂无带截止日期的任务',
    sub: '给任务定个时间，就不会忘啦'
  },
  all: {
    title: '待办空空如也',
    sub: '新建一个任务，开始今天的节奏'
  },
  done: {
    title: '还没有完成的任务',
    sub: '完成第一个，给自己一点奖励'
  }
}

const emptyTitle = computed(() => {
  if (activeCategory.value && !tasks.value.length) return '这个分类下还没有任务'
  return emptyMap[activeTab.value].title
})
const emptySub = computed(() => {
  if (activeCategory.value && !tasks.value.length) {
    return '说一句「二宝的手工作业月底交」，会自动归到这里'
  }
  return emptyMap[activeTab.value].sub
})

const tasks = computed(() => {
  let tops = topTasks()
  if (activeCategory.value) {
    tops = tops.filter(t => t.categoryId === activeCategory.value)
  }
  if (activeTab.value === 'today') {
    return sortByDue(tops.filter(t => isToday(t)))
  }
  if (activeTab.value === 'deadline') {
    return sortByDue(tops.filter(t => !t.done && hasDeadline(t)))
  }
  if (activeTab.value === 'all') {
    return sortByDue(tops.filter(t => !t.done))
  }
  return tops
    .filter(t => t.done)
    .sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0))
})

function countOf(id) {
  return countByCategory(id)
}

function chipStyle(c) {
  if (activeCategory.value === c.id) {
    return { background: c.color, borderColor: c.color, color: '#ffffff' }
  }
  return { color: c.color, borderColor: hexToRgba(c.color, 0.35) }
}

function goCategories() {
  uni.navigateTo({ url: '/pages/categories/categories' })
}

function goAdd() {
  uni.navigateTo({ url: '/pages/add/add' })
}

function goImport() {
  uni.navigateTo({ url: '/pages/import/import' })
}

onShow(() => {
  const tab = consumeTab()
  if (tab) activeTab.value = tab
})
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: #f6f4fb;
  padding-bottom: 24rpx;
}

.hero {
  padding: 30rpx 34rpx 36rpx;
  background: linear-gradient(135deg, #8d7bff 0%, #b49cff 55%, #ffb8d2 100%);
  border-radius: 0 0 44rpx 44rpx;
  color: #ffffff;
  flex-shrink: 0;
}

.hero-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.hero-left {
  display: flex;
  align-items: center;
}

.badge {
  width: 76rpx;
  height: 76rpx;
  border-radius: 24rpx;
  background: rgba(255, 255, 255, 0.24);
  border: 1rpx solid rgba(255, 255, 255, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 34rpx;
  font-weight: 700;
  color: #ffffff;
}

.hero-copy {
  display: flex;
  flex-direction: column;
  margin-left: 20rpx;
}

.greet {
  font-size: 36rpx;
  font-weight: 700;
  letter-spacing: 1rpx;
}

.today {
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.82);
  margin-top: 6rpx;
}

.import-link {
  display: flex;
  align-items: center;
  padding: 12rpx 22rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.2);
  border: 1rpx solid rgba(255, 255, 255, 0.32);
  font-size: 24rpx;
}

.import-dot {
  font-size: 28rpx;
  margin-right: 6rpx;
  line-height: 1;
}

.progress-card {
  margin-top: 30rpx;
  padding: 24rpx 28rpx;
  border-radius: 28rpx;
  background: rgba(255, 255, 255, 0.18);
  border: 1rpx solid rgba(255, 255, 255, 0.28);
  display: flex;
  align-items: center;
}

.progress-num-wrap {
  display: flex;
  align-items: flex-end;
  flex-wrap: wrap;
  width: 190rpx;
  flex-shrink: 0;
  position: relative;
}

.progress-num {
  font-size: 58rpx;
  font-weight: 700;
  line-height: 1;
}

.progress-unit {
  font-size: 24rpx;
  margin-left: 4rpx;
  margin-bottom: 6rpx;
}

.progress-label {
  width: 100%;
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.8);
  margin-top: 10rpx;
}

.progress-right {
  flex: 1;
  min-width: 0;
  padding-left: 10rpx;
}

.bar {
  height: 16rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.26);
  overflow: hidden;
}

.bar-inner {
  height: 100%;
  border-radius: 999rpx;
  background: linear-gradient(90deg, #ffffff, #ffe3ef);
  transition: width 0.4s ease;
}

.progress-tip {
  display: block;
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.88);
  margin-top: 14rpx;
}

.cat-bar {
  width: 100%;
  white-space: nowrap;
  padding: 22rpx 0 2rpx;
}

.cat-row {
  display: flex;
  align-items: center;
  padding: 0 34rpx;
}

.cat-chip {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: 52rpx;
  padding: 0 22rpx;
  margin-right: 14rpx;
  border-radius: 26rpx;
  border: 1rpx solid #e4dff2;
  background: #ffffff;
  font-size: 24rpx;
  color: #8e87a6;

  &.active {
    background: #7c6cf0;
    border-color: #7c6cf0;
    color: #ffffff;
    font-weight: 600;
  }
}

.cat-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  margin-right: 10rpx;
}

.cat-count {
  font-size: 20rpx;
  margin-left: 8rpx;
  opacity: 0.85;
}

.cat-manage {
  color: #b0aac2;
  border-style: dashed;
}

.tabs {
  display: flex;
  align-items: center;
  padding: 26rpx 34rpx 14rpx;
  background: #f6f4fb;
  position: sticky;
  top: 0;
  z-index: 10;
}

.tab {
  display: flex;
  align-items: center;
  padding: 14rpx 24rpx;
  border-radius: 999rpx;
  margin-right: 14rpx;
  font-size: 26rpx;
  color: #8e87a6;
  background: rgba(255, 255, 255, 0.6);
  border: 1rpx solid transparent;
  transition: all 0.2s ease;

  &.active {
    color: #6a58e8;
    font-weight: 600;
    background: #ffffff;
    border-color: rgba(124, 108, 240, 0.18);
    box-shadow: 0 8rpx 20rpx rgba(124, 108, 240, 0.14);
  }
}

.tab-count {
  font-size: 20rpx;
  margin-left: 8rpx;
  padding: 0 8rpx;
  border-radius: 999rpx;
  background: #f0edff;
  color: #7c6cf0;
  line-height: 1.8;
}

.list {
  padding: 6rpx 34rpx 180rpx;
  box-sizing: border-box;
}

.task-list {
  padding-top: 6rpx;
}

.list-space {
  height: 180rpx;
}

.empty {
  padding-top: 110rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.empty-orb {
  width: 148rpx;
  height: 148rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #efeaff, #ffe8f1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 52rpx;
  color: #b49cff;
  font-weight: 700;
  box-shadow: 0 16rpx 40rpx rgba(124, 108, 240, 0.12);
}

.empty-title {
  margin-top: 32rpx;
  font-size: 30rpx;
  font-weight: 600;
  color: #3c3557;
}

.empty-sub {
  margin-top: 12rpx;
  font-size: 24rpx;
  color: #9a93b0;
  text-align: center;
  width: 460rpx;
  line-height: 1.6;
}

.empty-btn {
  margin-top: 40rpx;
  padding: 20rpx 46rpx;
  border-radius: 999rpx;
  background: linear-gradient(135deg, #7c6cf0, #b49cff);
  color: #ffffff;
  font-size: 26rpx;
  font-weight: 600;
  box-shadow: 0 14rpx 30rpx rgba(124, 108, 240, 0.3);
}

.fab {
  position: fixed;
  right: 38rpx;
  bottom: calc(48rpx + env(safe-area-inset-bottom));
  width: 108rpx;
  height: 108rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #7c6cf0, #a78bfa 60%, #ff9ec4);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 18rpx 40rpx rgba(124, 108, 240, 0.38);
  z-index: 20;
}

.fab-plus {
  color: #ffffff;
  font-size: 58rpx;
  line-height: 1;
  margin-top: -4rpx;
}
</style>
