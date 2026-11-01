<template>
  <view class="bubble-row" :class="rowClass">
      <view class="bubble" :class="[bubbleClass, home ? 'bubble-home' : '']">
      <text v-if="message.role === 'system'" class="plain">{{ message.content || '' }}</text>
      <view v-else-if="message.role === 'user'">
        <text v-for="(line, index) in userLines" :key="index" class="plain user-line">{{ line }}</text>
      </view>
      <view v-else>
        <view v-if="toolCard" class="tool-card">
          <view class="tool-head" @click="toolOpen = !toolOpen">
            <text class="tool-name">{{ toolLabel }}</text>
            <uni-icons :type="toolOpen ? 'down' : 'up'" size="16" color="#0b57d0"></uni-icons>
          </view>
          <view v-if="toolOpen" class="tool-body">
            <text v-if="pressureEmpty" class="tool-line">暂无血压记录，可以先录入血压等健康数据。</text>
            <text v-else-if="toolStatusText" class="tool-status">{{ toolStatusText }}</text>
            <view v-if="recordLines.length">
              <text v-for="(line, index) in recordLines" :key="'rec-' + index" class="tool-line">{{ line }}</text>
            </view>
            <view v-if="candidateLines.length">
              <text v-for="(line, index) in candidateLines" :key="'cand-' + index" class="tool-line">{{ line }}</text>
            </view>
            <view v-if="showConfirm" class="confirm-row">
              <text v-if="showSave" class="action" @click="$emit('confirm', '确认')">确认</text>
              <text class="action" @click="$emit('confirm', '取消')">取消</text>
            </view>
          </view>
        </view>
        <markdown-view :home="home" :content="textBeforeChart"></markdown-view>
        <health-chart v-if="placedChart" :kind="placedChart.kind" :records="placedChart.records"></health-chart>
        <markdown-view v-if="textAfterChart" :home="home" :content="textAfterChart"></markdown-view>
      </view>
      <view v-if="citationFailed" class="cite-card">
        <text class="tool-line">有一侧没有完成。失败说明在正文里，不作为成功依据。</text>
      </view>
      <view v-for="(card, index) in citationCards" :key="'cite-' + index" class="cite-card">
        <text class="tool-name">{{ card.heading }}</text>
        <text v-if="card.categoryLabel" class="tool-line">{{ card.categoryLabel }}</text>
        <text v-for="(line, lineIndex) in card.lines" :key="'line-' + lineIndex" class="tool-line">{{ line }}</text>
        <image v-for="(src, imageIndex) in card.images" :key="'img-' + imageIndex" class="cite-image" :src="src" mode="aspectFill" @click="previewImages(card.images, src)"></image>
        <text v-if="card.scoreText" class="tool-line">{{ card.scoreText }}</text>
        <text v-if="card.sourceLine" class="tool-line">{{ card.sourceLine }}</text>
      </view>
      <view v-if="intentText" class="intent">{{ intentText }}</view>
      <view v-if="message.status === '0'" class="status">生成中</view>
      <view v-if="message.status === '2'" class="status">已停止</view>
      <view v-if="message.status === '3'" class="error">{{ message.errorMsg || '生成失败' }}</view>
      <view v-if="message.role === 'assistant' && !home" class="answer-foot">
        <text class="answer-note">AI内容生成，仅供参考</text>
        <view class="answer-icons">
          <view class="icon-hit" @click="copyContent">
            <uni-icons type="paperclip" size="22" color="#3c96f3"></uni-icons>
          </view>
          <view class="icon-hit" @click="liked = !liked">
            <uni-icons :type="liked ? 'heart-filled' : 'heart'" size="22" :color="liked ? '#e25b5b' : '#3c96f3'"></uni-icons>
          </view>
          <view v-if="showRetry" class="icon-hit" @click="$emit('retry', message)">
            <uni-icons type="reload" size="22" color="#3c96f3"></uni-icons>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
  import MarkdownView from '@/components/ai/markdown-view.vue'
  import HealthChart from '@/components/digital-human/health-chart.vue'
  import { buildHealthOption } from '@/components/digital-human/health-option'
  import config from '@/config'

  const CHART_ANCHOR = /这里展示最近\d+条[。.]?/

  const CHART_KIND = {
    query_blood_pressure: 'bp',
    query_blood_glucose: 'glucose',
    query_body_metric: 'body',
    query_sleep: 'sleep'
  }

  const AGING_LABELS = {
    LAYOUT_COMPONENT: '布局构件',
    LIGHTING: '照明',
    MATERIAL: '材料',
    COLOR: '色彩'
  }

  const KNOWLEDGE_LABELS = {
    pension_policy: '养老政策',
    health_education: '健康宣教',
    aging_friendly: '适老化知识'
  }

  const EFFECTIVE_LABELS = {
    '0': '未核验',
    '1': '有效',
    '2': '已废止'
  }

  function isAgingCitation(item) {
    const category = item && (item.category || item.knowledgeType)
    return !!AGING_LABELS[category]
  }

  function categoryLabel(item) {
    const category = item && (item.category || item.knowledgeType)
    if (AGING_LABELS[category]) {
      return AGING_LABELS[category]
    }
    if (KNOWLEDGE_LABELS[category]) {
      return KNOWLEDGE_LABELS[category]
    }
    return ''
  }

  var UPLOAD_IMAGE = /^\/profile\/upload\/.+\.(bmp|gif|jpg|jpeg|png)$/i

  function safeImageRefs(value) {
    var base = String(config.baseUrl || '').replace(/\/$/, '')
    return String(value || '').split(',').map(function(item) {
      return item.trim()
    }).filter(function(item) {
      if (!item || item.indexOf('..') >= 0 || item.indexOf('\\') >= 0) {
        return false
      }
      var path = item.split('?')[0].split('#')[0]
      if (UPLOAD_IMAGE.test(path)) {
        return true
      }
      return item.indexOf('http://') === 0 || item.indexOf('https://') === 0
    }).map(function(item) {
      var path = item.split('?')[0].split('#')[0]
      if (UPLOAD_IMAGE.test(path)) {
        return base + item
      }
      return item
    })
  }

  function pushLine(lines, label, value) {
    if (value === undefined || value === null || String(value).trim() === '') {
      return
    }
    lines.push(label + '：' + value)
  }

  function buildCitationCard(item) {
    if (!item) {
      return null
    }
    const aging = isAgingCitation(item)
    const lines = []
    if (aging) {
      pushLine(lines, '法规内容', item.regulationContent)
      pushLine(lines, '法规来源', item.regulationSource)
      pushLine(lines, '法规版本', item.regulationVersion)
      if (item.effectiveStatus !== undefined && item.effectiveStatus !== null && String(item.effectiveStatus) !== '') {
        const statusLabel = EFFECTIVE_LABELS[String(item.effectiveStatus)] || String(item.effectiveStatus)
        lines.push('法规状态：' + statusLabel)
      }
      pushLine(lines, '限制', item.limitations)
    } else if (item.excerpt) {
      lines.push(String(item.excerpt))
    }
    if (!aging && item.limitations) {
      lines.push('限制：' + item.limitations)
    }
    const sourceParts = []
    if (item.knowledgeId !== undefined && item.knowledgeId !== null && item.knowledgeId !== '') {
      sourceParts.push('知识 ' + item.knowledgeId)
    }
    if (item.title) {
      sourceParts.push(item.title)
    }
    if (item.source) {
      sourceParts.push(item.source)
    }
    if (item.chunkId) {
      sourceParts.push('片段 ' + item.chunkId)
    }
    if (item.documentId) {
      sourceParts.push('文档 ' + item.documentId)
    }
    let scoreText = ''
    const score = item.rerankScore != null && item.rerankScore !== '' ? item.rerankScore : item.score
    if (score != null && score !== '') {
      scoreText = '相关度 ' + score
    }
    return {
      heading: aging ? '适老化' : '知识引用',
      categoryLabel: categoryLabel(item),
      lines: lines,
      images: aging ? safeImageRefs(item.imageRefs) : [],
      scoreText: scoreText,
      sourceLine: sourceParts.join(' · ')
    }
  }

  function present(value) {
    return value != null && value !== ''
  }

  function summarizePressure(row) {
    const parts = []
    if (present(row.measureTime)) {
      parts.push(String(row.measureTime))
    }
    if (present(row.systolic)) {
      parts.push('收缩压 ' + row.systolic)
    }
    if (present(row.diastolic)) {
      parts.push('舒张压 ' + row.diastolic)
    }
    if (present(row.pulse)) {
      parts.push('脉搏 ' + row.pulse)
    }
    return parts.join(' ')
  }

  function summarizeRecord(row, toolName) {
    if (!row) {
      return ''
    }
    const pressureTool = toolName === 'query_blood_pressure' || toolName === 'insert_blood_pressure'
    const pressureRow = present(row.systolic) || present(row.diastolic) || present(row.pulse)
    if (pressureTool || pressureRow) {
      return summarizePressure(row)
    }
    if (row.glucoseValue != null) {
      const types = { '1': '空腹', '2': '餐后', '3': '随机' }
      const kind = types[String(row.measureType)] || ''
      return (row.measureTime || '') + ' ' + row.glucoseValue + (kind ? ' ' + kind : '')
    }
    if (row.heightCm != null || row.weightKg != null) {
      const bmi = row.bmi != null ? ' BMI ' + row.bmi : ''
      return (row.measureTime || '') + ' 身高 ' + row.heightCm + ' 体重 ' + row.weightKg + bmi
    }
    if (row.sleepDate || row.durationMinutes != null) {
      const duration = row.durationMinutes != null ? ' ' + row.durationMinutes + '分钟' : ''
      return (row.sleepDate || '') + ' ' + (row.startTime || '') + ' ' + (row.endTime || '') + duration
    }
    return ''
  }

  export default {
    components: {
      MarkdownView,
      HealthChart
    },
    data() {
      return {
        toolOpen: true,
        liked: false
      }
    },
    props: {
      message: {
        type: Object,
        required: true
      },
      canRetry: {
        type: Boolean,
        default: false
      },
      canConfirm: {
        type: Boolean,
        default: false
      },
      home: {
        type: Boolean,
        default: false
      }
    },
    computed: {
      rowClass() {
        return this.message.role === 'user' ? 'is-user' : 'is-assistant'
      },
      bubbleClass() {
        return this.message.role === 'user' ? 'bubble-user' : 'bubble-assistant'
      },
      userLines() {
        const content = this.message.content || ''
        const lines = String(content).split('\n')
        return lines.length ? lines : ['']
      },
      showRetry() {
        if (!this.canRetry || this.message.role !== 'assistant' || !this.message.messageId) {
          return false
        }
        return this.message.status !== '0'
      },
      toolCard() {
        const tool = this.message && this.message.tool
        if (!tool || this.message.role !== 'assistant') {
          return null
        }
        return tool
      },
      toolLabel() {
        const names = {
          query_blood_pressure: '查询血压',
          insert_blood_pressure: '录入血压',
          query_blood_glucose: '查询血糖',
          insert_blood_glucose: '录入血糖',
          query_body_metric: '查询身高体重',
          insert_body_metric: '录入身高体重',
          query_sleep: '查询睡眠',
          insert_sleep: '录入睡眠',
          query_medication: '查询用药',
          insert_medication: '录入用药'
        }
        const name = this.toolCard && this.toolCard.name
        return names[name] || '健康记录'
      },
      toolStatusText() {
        const tool = this.toolCard
        if (!tool) {
          return ''
        }
        if (tool.saved === true) {
          return '已保存'
        }
        const labels = {
          ok: '已返回',
          pending: '尚未保存',
          saved: '未保存',
          cancelled: '已取消',
          refused: '已拒绝',
          ambiguous: '有多名档案'
        }
        return labels[tool.status] || ''
      },
      showConfirm() {
        const tool = this.toolCard
        if (!this.canConfirm || !tool || tool.saved === true) {
          return false
        }
        if (this.message.status === '0') {
          return false
        }
        return tool.status === 'pending'
      },
      showSave() {
        return this.showConfirm && this.toolCard.ready !== false
      },
      pressureEmpty() {
        const tool = this.toolCard
        return !!(tool && tool.name === 'query_blood_pressure' && tool.status === 'ok' && (!tool.records || !tool.records.length))
      },
      recordLines() {
        const tool = this.toolCard
        const rows = tool && tool.records
        if (!rows || !rows.length) {
          return []
        }
        const name = tool.name
        return rows.map(function(row) {
          return summarizeRecord(row, name)
        }).filter(Boolean)
      },
      chartAnchor() {
        if (!this.message || this.message.role !== 'assistant') {
          return null
        }
        const content = this.message.content || ''
        const match = CHART_ANCHOR.exec(content)
        if (!match) {
          return null
        }
        return {
          end: match.index + match[0].length,
          content: content
        }
      },
      textBeforeChart() {
        const anchor = this.chartAnchor
        const content = (this.message && this.message.content) || ''
        return anchor ? anchor.content.slice(0, anchor.end) : content
      },
      textAfterChart() {
        const anchor = this.chartAnchor
        return anchor ? anchor.content.slice(anchor.end) : ''
      },
      placedChart() {
        if (!this.chartAnchor) {
          return null
        }
        const tool = this.toolCard
        const kind = tool && CHART_KIND[tool.name]
        if (!kind || !tool.records || !tool.records.length || !buildHealthOption(kind, tool.records)) {
          return null
        }
        return {
          kind: kind,
          records: tool.records
        }
      },
      candidateLines() {
        const rows = this.toolCard && this.toolCard.candidates
        if (!rows || !rows.length) {
          return []
        }
        return rows.map(function(item) {
          const name = item && item.name ? item.name : ''
          const dept = item && item.deptName ? item.deptName : ''
          return (name + ' ' + dept).trim()
        }).filter(Boolean)
      },
      intentText() {
        const labels = {
          KNOWLEDGE: '知识问答',
          TASK: '健康记录',
          ELDERLY_ADAPTATION: '适老化',
          MIXED: '健康与适老化',
          UNCERTAIN: '需要补充说明'
        }
        return labels[this.message && this.message.intent] || ''
      },
      citationFailed() {
        return this.message && this.message.role === 'assistant' && this.message.citationStatus === 'failed'
      },
      citationCards() {
        if (!this.message || this.message.role !== 'assistant' || this.message.status !== '1'
            || this.message.citationStatus === 'insufficient') {
          return []
        }
        const rows = this.message.citations || []
        return rows.map(buildCitationCard).filter(Boolean)
      }
    },
    methods: {
      copyContent() {
        const text = this.message && this.message.content ? String(this.message.content) : ''
        if (!text) {
          uni.showToast({
            title: '没有可复制的内容',
            icon: 'none'
          })
          return
        }
        uni.setClipboardData({
          data: text
        })
      },
      previewImages(urls, current) {
        if (!urls || !urls.length) {
          return
        }
        uni.previewImage({
          current: current || urls[0],
          urls: urls
        })
      }
    }
  }
</script>

<style lang="scss" scoped>
  .bubble-row {
    display: flex;
    margin-bottom: 12px;
  }

  .is-user {
    justify-content: flex-end;
  }

  .is-assistant {
    justify-content: flex-start;
  }

  .bubble {
    max-width: 86%;
    min-width: 0;
    box-sizing: border-box;
    overflow: hidden;
    padding: 10px 12px;
    border-radius: 16px;
    font-size: 16px;
    box-shadow: 0 4px 14px rgba(47, 111, 237, 0.06);
  }

  .bubble-user {
    background: #3c96f3;
    color: #fff;
  }

  .bubble-assistant {
    background: #fff;
    color: #333;
  }

  .plain,
  .user-line {
    display: block;
    line-height: 1.6;
    word-break: break-word;
    white-space: pre-wrap;
  }

  .intent,
  .status {
    margin-top: 6px;
    font-size: 16px;
    color: #5c6b7a;
  }

  .error {
    margin-top: 6px;
    font-size: 16px;
    color: #c4564a;
    line-height: 1.5;
  }

  .answer-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 10px;
  }

  .answer-note {
    flex: 1;
    min-width: 0;
    color: #5c6b7a;
    font-size: 16px;
    line-height: 22px;
  }

  .answer-icons {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    margin-left: 8px;
  }

  .icon-hit {
    width: 32px;
    height: 32px;
    margin-left: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .action {
    margin-right: 12px;
    color: #3c96f3;
    font-size: 16px;
  }

  .tool-card,
  .cite-card {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid #eaeef1;
  }

  .tool-card {
    margin-top: 0;
    margin-bottom: 8px;
    padding-top: 0;
    border-top: 0;
  }

  .tool-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .tool-body {
    margin-top: 6px;
  }

  .tool-name,
  .tool-status,
  .tool-line {
    display: block;
    font-size: 16px;
    line-height: 1.5;
    color: #3d4d5c;
    word-break: break-word;
  }

  .bubble-home {
    border-radius: 12px;
    box-shadow: none;
  }

  .bubble-home.bubble-user {
    background: #007aff;
  }

  .bubble-home .plain,
  .bubble-home .user-line {
    font-size: 20px;
  }

  .bubble-home .intent,
  .bubble-home .status,
  .bubble-home .error {
    font-size: 12px;
  }

  .bubble-home .action {
    color: #007aff;
    font-size: 13px;
  }

  .bubble-home .tool-card .tool-name,
  .bubble-home .tool-card .tool-status,
  .bubble-home .tool-card .tool-line {
    font-size: 18px;
  }

  .cite-image {
    display: block;
    width: 160px;
    height: 120px;
    margin-top: 6px;
    border-radius: 4px;
  }
</style>
