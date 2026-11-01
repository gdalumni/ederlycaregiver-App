<template>
  <view class="page">
    <view class="card">
      <input class="field" v-model="query" maxlength="2000" placeholder="检索问题，最长 2000 字" />
      <picker :range="categories" range-key="label" @change="onCategory">
        <view class="field">{{ categoryLabel }}</view>
      </picker>
      <view class="actions">
        <button size="mini" type="primary" :disabled="loading" @click="search">检索</button>
        <button size="mini" :disabled="loading" @click="answer">回答</button>
      </view>
      <text v-if="answerText" class="block">{{ answerText }}</text>
      <text v-for="(item, index) in citations" :key="index" class="block">{{ citeText(item) }}</text>
    </view>
    <view v-if="canAdd" class="card">
      <text class="tip">入库只接受公共知识，不要提交个人健康记录。</text>
      <input class="field" v-model="doc.title" placeholder="标题" />
      <input class="field" v-model="doc.source" placeholder="来源" />
      <picker :range="docCategories" range-key="label" @change="onDocCategory">
        <view class="field">{{ docCategoryLabel }}</view>
      </picker>
      <textarea class="area" v-model="doc.content" maxlength="20000" placeholder="正文，最长 20000" />
      <button size="mini" type="primary" :disabled="saving" @click="ingest">入库</button>
      <text v-if="lastDocumentId" class="tip">最近文档编号 {{ lastDocumentId }}</text>
    </view>
    <view v-if="canRemove" class="card">
      <input class="field" v-model="deleteId" placeholder="要删除的文档编号" />
      <button size="mini" type="warn" @click="removeDoc">删除</button>
    </view>
  </view>
</template>

<script>
  import { searchKnowledge, answerKnowledge, addKnowledgeDocument, removeKnowledgeDocument } from '@/api/ai/knowledge'

  export default {
    data() {
      return {
        query: '',
        category: '',
        categories: [
          { value: '', label: '全部分类' },
          { value: 'pension_policy', label: '养老政策' },
          { value: 'health_education', label: '健康科普' },
          { value: 'aging_friendly', label: '适老化' }
        ],
        docCategories: [
          { value: 'pension_policy', label: '养老政策' },
          { value: 'health_education', label: '健康科普' },
          { value: 'aging_friendly', label: '适老化' }
        ],
        doc: {
          title: '',
          source: '',
          category: 'pension_policy',
          content: ''
        },
        citations: [],
        answerText: '',
        loading: false,
        saving: false,
        lastDocumentId: '',
        deleteId: ''
      }
    },
    computed: {
      categoryLabel() {
        const found = this.categories.find(item => item.value === this.category)
        return found ? found.label : '全部分类'
      },
      docCategoryLabel() {
        const found = this.docCategories.find(item => item.value === this.doc.category)
        return found ? found.label : '养老政策'
      },
      canAdd() {
        return this.allowed('ai:knowledge:add')
      },
      canRemove() {
        return this.allowed('ai:knowledge:remove')
      }
    },
    methods: {
      allowed(code) {
        const permissions = this.$store.getters.permissions
        return !!(permissions && permissions.length && this.$auth.hasPermi(code))
      },
      onCategory(event) {
        const item = this.categories[Number(event.detail.value)]
        this.category = item ? item.value : ''
      },
      onDocCategory(event) {
        const item = this.docCategories[Number(event.detail.value)]
        if (item) {
          this.doc.category = item.value
        }
      },
      payload() {
        return {
          query: (this.query || '').trim(),
          topK: 5,
          similarityThreshold: 0.5,
          category: this.category
        }
      },
      search() {
        const body = this.payload()
        if (!body.query) {
          this.$modal.msgError('请输入检索问题')
          return
        }
        this.loading = true
        this.answerText = ''
        searchKnowledge(body).then(res => {
          this.citations = (res && res.data) || []
          if (!this.citations.length) {
            this.answerText = '没有检索结果'
          }
        }).catch(() => {}).finally(() => {
          this.loading = false
        })
      },
      answer() {
        const body = this.payload()
        if (!body.query) {
          this.$modal.msgError('请输入检索问题')
          return
        }
        this.loading = true
        answerKnowledge(body).then(res => {
          const data = res && res.data
          this.answerText = data && data.answer ? data.answer : '知识库未检索到足够依据'
          this.citations = (data && data.citations) || []
        }).catch(() => {}).finally(() => {
          this.loading = false
        })
      },
      citeText(item) {
        const title = item && item.title ? item.title : '未命名'
        const source = item && item.source ? ' · ' + item.source : ''
        const excerpt = item && item.excerpt ? ' ' + item.excerpt : ''
        return title + source + excerpt
      },
      ingest() {
        if (!this.doc.title || !this.doc.content) {
          this.$modal.msgError('请填写标题和正文')
          return
        }
        if (this.doc.content.length > 20000) {
          this.$modal.msgError('正文最长 20000 字')
          return
        }
        this.saving = true
        addKnowledgeDocument(this.doc).then(res => {
          const data = res && res.data
          this.lastDocumentId = data && data.documentId ? data.documentId : ''
          this.$modal.msgSuccess('已入库')
        }).catch(() => {}).finally(() => {
          this.saving = false
        })
      },
      removeDoc() {
        if (!this.deleteId) {
          this.$modal.msgError('请填写文档编号')
          return
        }
        removeKnowledgeDocument(this.deleteId).then(res => {
          if (res && res.code === 200) {
            this.deleteId = ''
            this.$modal.msgSuccess('已删除')
          }
        }).catch(() => {})
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

  .card {
    background: #fff;
    border-radius: 10px;
    padding: 12px;
    margin-bottom: 12px;
  }

  .field,
  .area {
    width: 100%;
    box-sizing: border-box;
    background: #f5f6f7;
    border-radius: 8px;
    padding: 8px 10px;
    margin-bottom: 8px;
    font-size: 14px;
  }

  .field {
    height: 36px;
  }

  .area {
    min-height: 96px;
  }

  .actions {
    display: flex;
    margin-bottom: 8px;
  }

  .block,
  .tip {
    display: block;
    color: #666;
    font-size: 13px;
    line-height: 1.5;
    margin-top: 6px;
    word-break: break-word;
  }
</style>
