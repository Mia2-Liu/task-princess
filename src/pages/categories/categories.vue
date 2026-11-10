<template>
  <view class="page">
    <view class="content">
      <view class="intro">
        <text class="intro-title">分类</text>
        <text class="intro-sub">语音里说到分类名，任务会自动归档</text>
      </view>

      <view class="list">
        <view v-for="c in categories" :key="c.id" class="row">
          <view class="dot" :style="{ background: c.color }"></view>

          <template v-if="editingId === c.id">
            <input
              v-model="editingName"
              class="edit-input"
              :maxlength="12"
              focus
              confirm-type="done"
              @confirm="saveRename(c.id)"
            />
            <text class="act primary" @click="saveRename(c.id)">保存</text>
            <text class="act" @click="cancelRename">取消</text>
          </template>

          <template v-else>
            <view class="row-main" @click="startRename(c)">
              <text class="row-name">{{ c.name }}</text>
              <text class="row-count">{{ countOf(c.id) }} 个待办</text>
            </view>
            <text class="act danger" @click="askRemove(c)">删除</text>
          </template>
        </view>

        <view v-if="!categories.length" class="empty">
          <text class="empty-text">还没有分类，先加一个吧</text>
        </view>
      </view>

      <view class="add-card">
        <text class="add-label">新增分类</text>
        <view class="add-row">
          <input
            v-model="newName"
            class="add-input"
            placeholder="例如：兴趣班、家务"
            placeholder-class="ph"
            :maxlength="12"
            @confirm="onAdd"
          />
          <view class="add-btn" @click="onAdd">添加</view>
        </view>
        <text class="add-note">
          删除分类不会删除任务，只会把该分类下的任务变成「未归类」。
        </text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import {
  categoryState,
  addCategory,
  renameCategory,
  removeCategory,
  loadCategories
} from '@/store/categories'
import { countByCategory, clearCategoryFromTasks } from '@/store/tasks'

loadCategories()

const categories = computed(() => categoryState.list)
const newName = ref('')
const editingId = ref('')
const editingName = ref('')

function countOf(id) {
  return countByCategory(id)
}

function onAdd() {
  const value = newName.value.trim()
  if (!value) {
    uni.showToast({ title: '先写个分类名', icon: 'none' })
    return
  }
  if (!addCategory(value)) {
    uni.showToast({ title: '这个名字已经有了', icon: 'none' })
    return
  }
  newName.value = ''
}

function startRename(category) {
  editingId.value = category.id
  editingName.value = category.name
}

function cancelRename() {
  editingId.value = ''
  editingName.value = ''
}

function saveRename(id) {
  const value = editingName.value.trim()
  if (!value) {
    uni.showToast({ title: '名字不能为空', icon: 'none' })
    return
  }
  renameCategory(id, value)
  cancelRename()
}

function askRemove(category) {
  const count = countByCategory(category.id)
  uni.showModal({
    title: `删除「${category.name}」`,
    content: count
      ? `该分类下还有 ${count} 个待办，删除后会变成未归类，任务不会丢失。`
      : '删除后不可恢复，任务不会丢失。',
    confirmColor: '#ff6b81',
    success: res => {
      if (!res.confirm) return
      clearCategoryFromTasks(category.id)
      removeCategory(category.id)
    }
  })
}
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: #f6f4fb;
}

.content {
  padding: 30rpx 34rpx 60rpx;
}

.intro {
  display: flex;
  flex-direction: column;
  padding: 8rpx 4rpx 26rpx;
}

.intro-title {
  font-size: 38rpx;
  font-weight: 700;
  color: #2b2540;
}

.intro-sub {
  font-size: 24rpx;
  color: #9a93b0;
  margin-top: 10rpx;
}

.list {
  background: #ffffff;
  border-radius: 28rpx;
  padding: 8rpx 26rpx;
  border: 1rpx solid rgba(124, 108, 240, 0.06);
  box-shadow: 0 12rpx 30rpx rgba(85, 70, 150, 0.06);
}

.row {
  display: flex;
  align-items: center;
  min-height: 104rpx;
  border-bottom: 1rpx solid #f2effa;

  &:last-child {
    border-bottom: none;
  }
}

.dot {
  width: 18rpx;
  height: 18rpx;
  border-radius: 50%;
  margin-right: 20rpx;
  flex-shrink: 0;
}

.row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.row-name {
  font-size: 29rpx;
  font-weight: 600;
  color: #2b2540;
}

.row-count {
  font-size: 22rpx;
  color: #b0aac2;
}

.edit-input {
  flex: 1;
  height: 64rpx;
  padding: 0 18rpx;
  border-radius: 14rpx;
  background: #f6f4fb;
  font-size: 27rpx;
  color: #2b2540;
}

.act {
  font-size: 24rpx;
  color: #9a93b0;
  padding: 10rpx 0 10rpx 20rpx;

  &.primary {
    color: #7c6cf0;
    font-weight: 600;
  }

  &.danger {
    color: #ff6b81;
  }
}

.empty {
  padding: 40rpx 0;
  text-align: center;
}

.empty-text {
  font-size: 24rpx;
  color: #b0aac2;
}

.add-card {
  margin-top: 26rpx;
  background: #ffffff;
  border-radius: 28rpx;
  padding: 28rpx 26rpx;
  border: 1rpx solid rgba(124, 108, 240, 0.06);
  box-shadow: 0 12rpx 30rpx rgba(85, 70, 150, 0.06);
}

.add-label {
  font-size: 25rpx;
  font-weight: 600;
  color: #3c3557;
}

.add-row {
  display: flex;
  align-items: center;
  margin-top: 18rpx;
}

.add-input {
  flex: 1;
  height: 76rpx;
  padding: 0 22rpx;
  border-radius: 18rpx;
  background: #f6f4fb;
  font-size: 26rpx;
  color: #2b2540;
}

.ph {
  color: #b8b2c9;
}

.add-btn {
  margin-left: 18rpx;
  height: 76rpx;
  line-height: 76rpx;
  padding: 0 34rpx;
  border-radius: 18rpx;
  background: linear-gradient(135deg, #7c6cf0, #b49cff);
  color: #ffffff;
  font-size: 26rpx;
  font-weight: 600;
}

.add-note {
  display: block;
  margin-top: 18rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: #b0aac2;
}
</style>
