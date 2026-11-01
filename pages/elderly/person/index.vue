<template>
  <view class="page">
    <view class="search">
      <input class="field" v-model="name" placeholder="按姓名查询" confirm-type="search" @confirm="reload" />
      <button size="mini" type="primary" @click="reload">查询</button>
      <button v-if="canAdd" size="mini" @click="openEdit()">新增</button>
    </view>
    <view v-if="loading && !rows.length" class="hint">正在加载</view>
    <view v-else-if="!rows.length" class="hint">没有档案</view>
    <view v-for="item in rows" :key="item.elderlyId" class="card">
      <view @click="openRecords(item)">
        <text class="name">{{ item.name }}</text>
        <text class="meta">{{ sexText(item.sex) }} · {{ item.deptName || '未填部门' }} · {{ item.status === '1' ? '停用' : '正常' }}</text>
        <text class="meta">停用档案仍可录入健康记录</text>
      </view>
      <view class="actions">
        <text class="link" @click="openRecords(item)">健康记录</text>
        <text v-if="canEdit" class="link" @click="openEdit(item)">编辑</text>
        <text v-if="canRemove" class="link danger" @click="remove(item)">删除</text>
      </view>
    </view>
    <view v-if="rows.length < total" class="hint" @click="loadMore">加载更多</view>
  </view>
</template>

<script>
  import { listPerson, removePerson } from '@/api/elderly/person'

  export default {
    data() {
      return {
        name: '',
        rows: [],
        total: 0,
        pageNum: 1,
        loading: false
      }
    },
    computed: {
      canAdd() {
        return this.allowed('elderly:person:add')
      },
      canEdit() {
        return this.allowed('elderly:person:edit')
      },
      canRemove() {
        return this.allowed('elderly:person:remove')
      }
    },
    onShow() {
      this.reload()
    },
    methods: {
      allowed(code) {
        const permissions = this.$store.getters.permissions
        if (!permissions || !permissions.length) {
          return false
        }
        return this.$auth.hasPermi(code)
      },
      sexText(sex) {
        if (sex === '0') return '男'
        if (sex === '1') return '女'
        return '未知'
      },
      reload() {
        this.pageNum = 1
        this.rows = []
        this.fetch()
      },
      loadMore() {
        if (this.loading || this.rows.length >= this.total) {
          return
        }
        this.pageNum += 1
        this.fetch()
      },
      fetch() {
        if (!this.allowed('elderly:person:list')) {
          this.$modal.msgError('没有档案查询权限')
          return
        }
        this.loading = true
        listPerson({
          pageNum: this.pageNum,
          pageSize: 10,
          name: this.name
        }).then(res => {
          const rows = (res && res.rows) || []
          this.total = res && res.total ? res.total : 0
          this.rows = this.pageNum === 1 ? rows : this.rows.concat(rows)
        }).catch(() => {}).finally(() => {
          this.loading = false
        })
      },
      openRecords(item) {
        this.$tab.navigateTo('/pages/elderly/record/index?elderlyId=' + item.elderlyId + '&name=' + encodeURIComponent(item.name || ''))
      },
      openEdit(item) {
        const id = item && item.elderlyId ? '?elderlyId=' + item.elderlyId : ''
        this.$tab.navigateTo('/pages/elderly/person/edit' + id)
      },
      remove(item) {
        const self = this
        uni.showModal({
          title: '删除档案',
          content: '删除后列表不再显示 ' + (item.name || ''),
          success(result) {
            if (!result.confirm) {
              return
            }
            removePerson(item.elderlyId).then(res => {
              if (res && res.code === 200) {
                self.reload()
              }
            }).catch(() => {})
          }
        })
      }
    }
  }
</script>

<style lang="scss" scoped>
  .page {
    min-height: 100%;
    background: #f5f6f7;
    padding: 12px;
    box-sizing: border-box;
  }

  .search {
    display: flex;
    align-items: center;
    margin-bottom: 12px;
  }

  .field {
    flex: 1;
    min-width: 0;
    height: 36px;
    background: #fff;
    border-radius: 8px;
    padding: 0 10px;
    margin-right: 8px;
  }

  .card {
    background: #fff;
    border-radius: 10px;
    padding: 12px;
    margin-bottom: 10px;
  }

  .name,
  .meta,
  .hint {
    display: block;
  }

  .name {
    font-size: 16px;
    color: #222;
  }

  .meta,
  .hint {
    margin-top: 4px;
    color: #888;
    font-size: 12px;
    line-height: 1.5;
  }

  .actions {
    display: flex;
    margin-top: 8px;
  }

  .link {
    margin-right: 14px;
    color: #007aff;
    font-size: 13px;
  }

  .danger {
    color: #dd524d;
  }
</style>
