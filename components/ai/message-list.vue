<template>
  <scroll-view scroll-y class="message-scroll" :style="{ height: height + 'px' }" :scroll-into-view="scrollInto" scroll-with-animation>
    <view class="message-list" :style="{ paddingTop: (padTop || 0) + 'px' }">
      <view v-if="hasOlder" class="older" @click="$emit('load-older')">加载更早的消息</view>
      <view v-if="loading && !messages.length" class="hint">正在加载历史消息</view>
      <view v-else-if="!messages.length && emptyText" class="empty">
        <text class="empty-title">暂无消息</text>
        <text class="empty-desc">{{ emptyText }}</text>
      </view>
      <view v-for="item in messages" :id="messageDomId(item)" :key="messageKey(item)">
        <message-bubble :message="item" :can-retry="canRetry" :can-confirm="canConfirm" @retry="$emit('retry', $event)" @confirm="$emit('confirm', $event)"></message-bubble>
      </view>
      <view v-if="sending" id="msg-sending" class="hint">正在等待回复</view>
    </view>
  </scroll-view>
</template>

<script>
  import MessageBubble from '@/components/ai/message-bubble.vue'

  export default {
    components: {
      MessageBubble
    },
    props: {
      messages: {
        type: Array,
        default: function() {
          return []
        }
      },
      loading: {
        type: Boolean,
        default: false
      },
      sending: {
        type: Boolean,
        default: false
      },
      hasOlder: {
        type: Boolean,
        default: false
      },
      canRetry: {
        type: Boolean,
        default: false
      },
      canConfirm: {
        type: Boolean,
        default: false
      },
      height: {
        type: Number,
        default: 400
      },
      padTop: {
        type: Number,
        default: 0
      },
      scrollInto: {
        type: String,
        default: ''
      },
      emptyText: {
        type: String,
        default: ''
      }
    },
    methods: {
      messageDomId(item) {
        if (item && item.messageId != null) {
          return 'msg-' + item.messageId
        }
        if (item && item.localId) {
          return 'msg-' + item.localId
        }
        return ''
      },
      messageKey(item) {
        if (item && item.localId) {
          return 'l-' + item.localId
        }
        if (item && item.messageId != null) {
          return 'm-' + item.messageId
        }
        if (item && item.requestId) {
          return 'r-' + item.requestId
        }
        return 'local-' + (item && item.role ? item.role : 'unknown')
      }
    }
  }
</script>

<style lang="scss" scoped>
  .message-scroll {
    background: #f5f8fc;
  }

  .message-list {
    padding: 12px;
    box-sizing: border-box;
  }

  .hint,
  .older {
    text-align: center;
    color: #5c6b7a;
    font-size: 16px;
    margin-bottom: 12px;
  }

  .empty {
    padding: 48px 24px;
    text-align: center;
  }

  .empty-title {
    display: block;
    color: #333;
    font-size: 16px;
    margin-bottom: 8px;
  }

  .empty-desc {
    display: block;
    color: #5c6b7a;
    font-size: 16px;
    line-height: 1.6;
  }
</style>
