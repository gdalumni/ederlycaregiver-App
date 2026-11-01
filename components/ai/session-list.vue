<template>
  <view class="session-list">
    <view class="session-head">
      <text class="session-title">会话</text>
      <view v-if="canCreate" class="session-create" @click="$emit('create')">
        <uni-icons type="plusempty" size="22" color="#3c96f3"></uni-icons>
      </view>
    </view>
    <scroll-view scroll-y class="session-scroll" @scrolltolower="$emit('load-more')">
      <view v-if="loading && !sessions.length" class="session-hint">正在加载</view>
      <view v-else-if="!sessions.length" class="session-hint">还没有会话</view>
      <view
        v-for="item in sessions"
        :key="item.sessionId"
        class="session-item"
        :class="{ active: sameSession(item) }"
        @click="$emit('select', item)"
      >
        <view class="session-main">
          <text class="session-name">{{ item.title || '新对话' }}</text>
          <text v-if="item.status === '1'" class="session-closed">已关闭</text>
        </view>
        <text v-if="canRemove" class="session-remove" @click.stop="$emit('remove', item)">删除</text>
      </view>
    </scroll-view>
  </view>
</template>

<script>
  export default {
    props: {
      sessions: {
        type: Array,
        default: function() {
          return []
        }
      },
      currentId: {
        type: [Number, String],
        default: null
      },
      loading: {
        type: Boolean,
        default: false
      },
      canCreate: {
        type: Boolean,
        default: false
      },
      canRemove: {
        type: Boolean,
        default: false
      }
    },
    methods: {
      sameSession(item) {
        return item && item.sessionId != null && String(item.sessionId) === String(this.currentId)
      }
    }
  }
</script>

<style lang="scss" scoped>
  .session-list {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #fff;
  }

  .session-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    border-bottom: 1px solid #eaeef1;
  }

  .session-title {
    font-size: 16px;
    font-weight: 600;
  }

  .session-create {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .session-remove {
    color: #3c96f3;
    font-size: 16px;
  }

  .session-scroll {
    flex: 1;
    height: 0;
  }

  .session-hint {
    text-align: center;
    color: #5c6b7a;
    font-size: 16px;
    padding: 24px 12px;
  }

  .session-item {
    display: flex;
    align-items: center;
    padding: 12px;
    border-bottom: 1px solid #f2f2f2;
  }

  .session-item.active {
    background: #eef6ff;
  }

  .session-main {
    flex: 1;
    min-width: 0;
  }

  .session-name {
    display: block;
    font-size: 16px;
    color: #333;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .session-closed {
    display: block;
    margin-top: 4px;
    font-size: 16px;
    color: #5c6b7a;
  }

  .session-remove {
    margin-left: 8px;
    flex-shrink: 0;
  }
</style>
