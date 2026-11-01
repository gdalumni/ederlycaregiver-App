<template>
  <view class="page">
    <view v-if="!canQuery" class="hint">没有查看公告的权限</view>
    <view v-else-if="loading" class="hint">正在加载</view>
    <view v-else-if="missing" class="hint">没有这条公告</view>
    <view v-else class="card">
      <text class="type">{{ typeLabel }}</text>
      <text class="title">{{ notice.noticeTitle }}</text>
      <text class="time">{{ notice.createTime || '' }}</text>
      <rich-text v-if="content" class="body" :nodes="content"></rich-text>
      <text v-else class="hint">这条公告没有正文</text>
    </view>
  </view>
</template>

<script>
  import { getNotice } from '@/api/system/notice'

  function typeText(value) {
    if (String(value) === '1') {
      return '通知'
    }
    if (String(value) === '2') {
      return '公告'
    }
    return '公告'
  }

  function readableHtml(value) {
    return String(value || '').replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
  }

  export default {
    data() {
      return {
        noticeId: '',
        notice: {},
        loading: false,
        missing: false
      }
    },
    computed: {
      canQuery() {
        return this.allowed('system:notice:query')
      },
      typeLabel() {
        return typeText(this.notice.noticeType)
      },
      content() {
        return readableHtml(this.notice.noticeContent).trim()
      }
    },
    onLoad(options) {
      this.noticeId = options && options.noticeId ? String(options.noticeId) : ''
      if (!this.canQuery || !this.noticeId) {
        this.missing = !this.noticeId
        return
      }
      this.load()
    },
    methods: {
      allowed(code) {
        const permissions = this.$store.getters && this.$store.getters.permissions
        if (!permissions || !permissions.length) {
          return false
        }
        return this.$auth.hasPermi(code)
      },
      load() {
        this.loading = true
        this.missing = false
        getNotice(this.noticeId).then(res => {
          const data = res && res.data
          if (!data || String(data.status) === '1') {
            this.missing = true
            this.notice = {}
            return
          }
          this.notice = data
        }).catch(() => {
          this.missing = true
        }).finally(() => {
          this.loading = false
        })
      }
    }
  }
</script>

<style scoped>
  .page {
    min-height: 100%;
    padding: 12px;
    background: #f5f6f7;
    box-sizing: border-box;
  }

  .card {
    padding: 16px;
    border-radius: 12px;
    background: #fff;
  }

  .type,
  .title,
  .time,
  .hint {
    display: block;
  }

  .type {
    color: #007aff;
    font-size: 12px;
  }

  .title {
    margin-top: 8px;
    color: #222;
    font-size: 18px;
    font-weight: 600;
    line-height: 1.5;
  }

  .time,
  .hint {
    margin-top: 8px;
    color: #888;
    font-size: 12px;
    line-height: 1.6;
  }

  .body {
    display: block;
    margin-top: 16px;
    color: #333;
    font-size: 15px;
    line-height: 1.7;
  }
</style>
