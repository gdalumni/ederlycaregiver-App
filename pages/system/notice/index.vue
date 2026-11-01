<template>
  <view class="page">
    <view v-if="!canList" class="hint">没有通知公告权限</view>
    <view v-else-if="loading && !rows.length" class="hint">正在加载</view>
    <view v-else-if="!rows.length" class="hint">没有公告</view>
    <view v-for="item in rows" :key="item.noticeId" class="card" @click="openDetail(item)">
      <view class="head">
        <text class="type">{{ typeText(item.noticeType) }}</text>
        <text class="time">{{ item.createTime || '' }}</text>
      </view>
      <text class="title">{{ item.noticeTitle }}</text>
    </view>
    <view v-if="canList && rows.length && rows.length < total" class="hint more" @click="loadMore">加载更多</view>
  </view>
</template>

<script>
  import { listNotice } from '@/api/system/notice'

  function typeText(value) {
    if (String(value) === '1') {
      return '通知'
    }
    if (String(value) === '2') {
      return '公告'
    }
    return '公告'
  }

  export default {
    data() {
      return {
        rows: [],
        total: 0,
        pageNum: 1,
        loading: false
      }
    },
    computed: {
      canList() {
        return this.allowed('system:notice:list')
      }
    },
    onShow() {
      if (this.canList) {
        this.reload()
      }
    },
    onPullDownRefresh() {
      if (!this.canList) {
        uni.stopPullDownRefresh()
        return
      }
      this.reload().finally(() => {
        uni.stopPullDownRefresh()
      })
    },
    methods: {
      typeText: typeText,
      allowed(code) {
        const permissions = this.$store.getters && this.$store.getters.permissions
        if (!permissions || !permissions.length) {
          return false
        }
        return this.$auth.hasPermi(code)
      },
      reload() {
        this.pageNum = 1
        this.rows = []
        this.total = 0
        return this.loadPage()
      },
      loadMore() {
        if (this.loading || this.rows.length >= this.total) {
          return
        }
        this.pageNum += 1
        this.loadPage()
      },
      loadPage() {
        this.loading = true
        return listNotice({
          pageNum: this.pageNum,
          pageSize: 10,
          status: '0'
        }).then(res => {
          const list = ((res && res.rows) || []).filter(function(item) {
            return item && String(item.status) === '0' && item.noticeId != null
          })
          this.total = Number(res && res.total) || 0
          this.rows = this.pageNum === 1 ? list : this.rows.concat(list)
        }).catch(() => {}).finally(() => {
          this.loading = false
        })
      },
      openDetail(item) {
        if (!item || item.noticeId == null) {
          return
        }
        this.$tab.navigateTo('/pages/system/notice/detail?noticeId=' + item.noticeId)
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
    margin-bottom: 10px;
    padding: 14px;
    border-radius: 12px;
    background: #fff;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .type {
    padding: 2px 8px;
    border-radius: 10px;
    background: rgba(0, 122, 255, 0.1);
    color: #007aff;
    font-size: 12px;
  }

  .time,
  .hint {
    color: #888;
    font-size: 12px;
  }

  .title {
    display: block;
    margin-top: 8px;
    color: #222;
    font-size: 16px;
    line-height: 1.5;
  }

  .hint {
    padding: 24px 0;
    text-align: center;
  }

  .more {
    color: #007aff;
  }
</style>
