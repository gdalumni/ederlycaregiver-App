<template>
  <view class="page" :class="{ aging: aging }">
    <view class="head">
      <text class="title">{{ personName || '健康管理' }}</text>
      <text class="aging-switch" @click="toggleAging">{{ aging ? '适老化已打开' : '适老化显示' }}</text>
    </view>
    <view v-if="!visibleSections.length" class="hint">没有健康记录权限</view>
    <view v-for="item in visibleSections" :key="item.key" class="section">
      <text class="section-title">{{ item.label }}</text>
      <view class="ranges">
        <text
          v-for="range in ranges"
          :key="item.key + range.key"
          class="chip"
          :class="{ on: sections[item.key].range === range.key }"
          @click="setRange(item.key, range.key)"
        >{{ range.label }}</text>
      </view>
      <view v-if="sections[item.key].range === 'custom'" class="custom">
        <input class="field" v-model="sections[item.key].begin" placeholder="开始日期 yyyy-MM-dd" @blur="loadSection(item.key)" />
        <input class="field" v-model="sections[item.key].end" placeholder="结束日期 yyyy-MM-dd" @blur="loadSection(item.key)" />
      </view>
      <text class="block-label">{{ item.label }}趋势图</text>
      <text v-if="sections[item.key].loading && !sections[item.key].rows.length" class="hint">正在加载</text>
      <text v-else-if="!sections[item.key].rows.length" class="hint">这段时间没有记录</text>
      <health-chart
        v-if="sections[item.key].rows.length"
        :kind="item.key"
        :records="sections[item.key].rows"
        :aging="aging"
        :sleep-hours="item.key === 'sleep'"
      ></health-chart>
      <text v-if="sections[item.key].truncated" class="hint">还有更早的记录没有画入这张图</text>
      <view class="action-row">
        <text class="block-label inline">趋势分析</text>
        <view class="action-btns">
          <text v-if="canAdd(item)" class="side-btn" @click="sections[item.key].formOpen = !sections[item.key].formOpen">{{ sections[item.key].formOpen ? '收起' : '记一笔' }}</text>
          <text v-if="canRemove(item)" class="side-btn ghost" @click="openMaintain(item)">维护</text>
        </view>
      </view>
      <view v-if="trendLines(item.key).length" class="stats">
        <text v-for="(line, index) in trendLines(item.key)" :key="item.key + '-s' + index" class="stat">{{ line }}</text>
      </view>
      <text v-else-if="sections[item.key].rows.length && !sections[item.key].loading" class="hint">这段时间没有可统计的数据</text>
      <view v-if="trendSummary(item.key)" class="summary-block">
        <text class="block-label">分析总结</text>
        <text class="summary">{{ trendSummary(item.key) }}</text>
      </view>
      <view v-if="canAdd(item) && sections[item.key].formOpen" class="card">
        <block v-if="item.key === 'bp'">
          <input class="field" v-model="sections[item.key].form.systolic" type="number" placeholder="收缩压" />
          <input class="field" v-model="sections[item.key].form.diastolic" type="number" placeholder="舒张压" />
          <input class="field" v-model="sections[item.key].form.pulse" type="number" placeholder="脉搏，可空" />
          <input class="field" v-model="sections[item.key].form.measureTime" placeholder="测量时间 yyyy-MM-dd HH:mm:ss" />
        </block>
        <block v-else-if="item.key === 'glucose'">
          <input class="field" v-model="sections[item.key].form.glucoseValue" type="digit" placeholder="血糖值" />
          <picker :range="glucoseTypes" range-key="label" @change="onGlucoseType(item.key, $event)">
            <view class="field">{{ glucoseLabel(sections[item.key].form.measureType) }}</view>
          </picker>
          <input class="field" v-model="sections[item.key].form.measureTime" placeholder="测量时间 yyyy-MM-dd HH:mm:ss" />
        </block>
        <block v-else-if="item.key === 'body'">
          <input class="field" v-model="sections[item.key].form.heightCm" type="digit" placeholder="身高厘米" />
          <input class="field" v-model="sections[item.key].form.weightKg" type="digit" placeholder="体重千克" />
          <input class="field" v-model="sections[item.key].form.measureTime" placeholder="测量时间 yyyy-MM-dd HH:mm:ss" />
        </block>
        <block v-else-if="item.key === 'medication'">
          <input class="field" v-model="sections[item.key].form.drugName" placeholder="药品名称" />
          <input class="field" v-model="sections[item.key].form.dosage" placeholder="用法或剂量" />
          <input class="field" v-model="sections[item.key].form.measureTime" placeholder="用药时间 yyyy-MM-dd HH:mm:ss" />
        </block>
        <block v-else>
          <input class="field" v-model="sections[item.key].form.sleepDate" placeholder="睡眠日期 yyyy-MM-dd" />
          <input class="field" v-model="sections[item.key].form.startTime" placeholder="开始 yyyy-MM-dd HH:mm:ss" />
          <input class="field" v-model="sections[item.key].form.endTime" placeholder="结束 yyyy-MM-dd HH:mm:ss" />
        </block>
        <input class="field" v-model="sections[item.key].form.remark" placeholder="备注" />
        <button class="save" size="mini" type="primary" :disabled="sections[item.key].saving" @click="submit(item.key)">保存</button>
      </view>
    </view>
    <uni-popup ref="maintainPopup" type="bottom" background-color="#ffffff">
      <view class="popup">
        <text class="section-title">{{ maintainTitle }}</text>
        <text v-if="!maintainRows.length" class="hint">没有可删除的记录</text>
        <scroll-view v-else scroll-y class="popup-list">
          <view v-for="row in maintainRows" :key="'m-' + row.recordId" class="popup-row">
            <text class="line">{{ summary(maintainKey, row) }}</text>
            <text class="danger" @click="remove(maintainType, row)">删除</text>
          </view>
        </scroll-view>
        <text class="link close" @click="closeMaintain">关闭</text>
      </view>
    </uni-popup>
  </view>
</template>

<script>
  import HealthChart from '@/components/digital-human/health-chart.vue'
  import { recordTypes, listRecords, saveRecord, removeRecords } from '@/api/elderly/record'
  import { getOwnPerson, ensureOwnPerson } from '@/api/elderly/person'

  const SECTION_ORDER = ['bp', 'glucose', 'sleep', 'medication', 'body']
  const AGING_KEY = 'health-record-aging'
  const PAGE_LIMIT = 10

  function pad(value) {
    return value < 10 ? '0' + value : String(value)
  }

  function formatDay(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
  }

  function presetRange(days) {
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - (Number(days) - 1))
    return {
      beginTime: formatDay(start) + ' 00:00:00',
      endTime: formatDay(end) + ' 23:59:59'
    }
  }

  function emptyForm() {
    return {
      systolic: '',
      diastolic: '',
      pulse: '',
      measureTime: '',
      glucoseValue: '',
      measureType: '1',
      heightCm: '',
      weightKg: '',
      sleepDate: '',
      startTime: '',
      endTime: '',
      drugName: '',
      dosage: '',
      remark: ''
    }
  }

  function sectionState() {
    return {
      range: '30',
      begin: '',
      end: '',
      rows: [],
      total: 0,
      loading: false,
      truncated: false,
      formOpen: false,
      saving: false,
      form: emptyForm()
    }
  }

  export default {
    components: {
      HealthChart
    },
    data() {
      return {
        elderlyId: '',
        personName: '',
        ownMode: false,
        maintainKey: '',
        aging: false,
        ranges: [
          { key: '7', label: '近7天' },
          { key: '30', label: '近30天' },
          { key: '90', label: '近90天' },
          { key: 'custom', label: '自定义' }
        ],
        glucoseTypes: [
          { value: '1', label: '空腹' },
          { value: '2', label: '餐后' },
          { value: '3', label: '随机' }
        ],
        sections: {
          bp: sectionState(),
          glucose: sectionState(),
          sleep: sectionState(),
          medication: sectionState(),
          body: sectionState()
        }
      }
    },
    computed: {
      visibleSections() {
        const self = this
        return SECTION_ORDER.map(function(key) {
          return recordTypes.find(function(item) {
            return item.key === key
          })
        }).filter(function(item) {
          return item && self.allowed(item.perm + ':list')
        })
      },
      maintainType() {
        return this.typeOf(this.maintainKey)
      },
      maintainTitle() {
        return (this.maintainType ? this.maintainType.label : '健康') + '记录'
      },
      maintainRows() {
        const section = this.sections[this.maintainKey]
        return section ? section.rows : []
      }
    },
    onLoad(options) {
      this.elderlyId = options && options.elderlyId ? options.elderlyId : ''
      this.ownMode = !this.elderlyId
      this.personName = options && options.name ? decodeURIComponent(options.name) : ''
      try {
        this.aging = uni.getStorageSync(AGING_KEY) === '1'
      } catch (error) {
        this.aging = false
      }
    },
    onShow() {
      if (this.ownMode) {
        this.loadOwn()
        return
      }
      this.reloadAll()
    },
    methods: {
      reloadAll() {
        this.visibleSections.forEach(item => {
          this.loadSection(item.key)
        })
      },
      loadOwn() {
        getOwnPerson().then(res => {
          const data = res && res.data
          if (data && data.elderlyId) {
            this.elderlyId = data.elderlyId
            this.personName = data.name || ''
            this.reloadAll()
            return
          }
          this.elderlyId = ''
          this.personName = ''
          this.clearSections()
        }).catch(() => {})
      },
      clearSections() {
        const self = this
        SECTION_ORDER.forEach(function(key) {
          const section = self.sections[key]
          section.rows = []
          section.total = 0
          section.truncated = false
          section.loading = false
        })
      },
      openMaintain(item) {
        this.maintainKey = item.key
        this.$nextTick(() => {
          if (this.$refs.maintainPopup) {
            this.$refs.maintainPopup.open('bottom')
          }
        })
      },
      closeMaintain() {
        if (this.$refs.maintainPopup) {
          this.$refs.maintainPopup.close()
        }
      },
      collect(rows, pick) {
        const values = []
        ;(rows || []).forEach(function(row) {
          const number = Number(pick(row))
          if (Number.isFinite(number)) {
            values.push(number)
          }
        })
        return values
      },
      statOf(values) {
        if (!values.length) {
          return null
        }
        let min = values[0]
        let max = values[0]
        let sum = 0
        values.forEach(function(value) {
          sum += value
          if (value < min) {
            min = value
          }
          if (value > max) {
            max = value
          }
        })
        return { avg: sum / values.length, min: min, max: max, count: values.length }
      },
      whole(value) {
        return String(Math.round(value))
      },
      one(value) {
        const text = (Math.round(Number(value) * 10) / 10).toFixed(1)
        return text.replace(/\.0$/, '')
      },
      rangeLabel(key) {
        const section = this.sections[key]
        const found = this.ranges.find(function(item) {
          return item.key === section.range
        })
        if (!found || found.key === 'custom') {
          return '所选时间'
        }
        return found.label
      },
      trendLines(key) {
        const built = this.buildTrend(key)
        return built.lines
      },
      trendSummary(key) {
        return this.buildTrend(key).summary
      },
      buildTrend(key) {
        const rows = (this.sections[key] && this.sections[key].rows) || []
        if (!rows.length) {
          return { lines: [], summary: '' }
        }
        if (key === 'bp') {
          return this.bpTrend(rows)
        }
        if (key === 'glucose') {
          return this.glucoseTrend(rows)
        }
        if (key === 'body') {
          return this.bodyTrend(rows)
        }
        if (key === 'sleep') {
          return this.sleepTrend(rows)
        }
        if (key === 'medication') {
          return this.medicationTrend(rows)
        }
        return { lines: [], summary: '' }
      },
      bpTrend(rows) {
        const high = this.statOf(this.collect(rows, function(row) { return row.systolic }))
        const low = this.statOf(this.collect(rows, function(row) { return row.diastolic }))
        const pulse = this.statOf(this.collect(rows, function(row) { return row.pulse }))
        if (!high || !low) {
          return { lines: [], summary: '' }
        }
        const pulseAvg = pulse ? ' · 脉搏 ' + this.whole(pulse.avg) : ''
        const pulseMax = pulse ? ' · 脉搏 ' + pulse.max : ''
        const pulseMin = pulse ? ' · 脉搏 ' + pulse.min : ''
        const lines = [
          '平均 高压 ' + this.whole(high.avg) + ' · 低压 ' + this.whole(low.avg) + pulseAvg,
          '最高 高压 ' + high.max + ' · 低压 ' + low.max + pulseMax,
          '最低 高压 ' + high.min + ' · 低压 ' + low.min + pulseMin
        ]
        let summary = this.rangeLabel('bp') + '共' + rows.length + '次。平均高压' + this.whole(high.avg) + '、低压' + this.whole(low.avg)
        if (pulse) {
          summary += '、脉搏' + this.whole(pulse.avg)
        }
        summary += '。高压最高' + high.max + '、最低' + high.min + '。'
        return { lines: lines, summary: summary }
      },
      glucoseTrend(rows) {
        const self = this
        const names = { '1': '空腹', '2': '餐后', '3': '随机' }
        const groups = { '1': [], '2': [], '3': [] }
        rows.forEach(function(row) {
          const type = String(row.measureType == null ? '' : row.measureType)
          const value = Number(row.glucoseValue)
          if (groups[type] && Number.isFinite(value)) {
            groups[type].push(value)
          }
        })
        const lines = []
        const parts = []
        ;['1', '2', '3'].forEach(function(type) {
          const stat = self.statOf(groups[type])
          if (!stat) {
            return
          }
          lines.push(names[type] + ' 平均 ' + self.one(stat.avg) + ' · 最高 ' + self.one(stat.max) + ' · 最低 ' + self.one(stat.min))
          parts.push(names[type] + '平均' + self.one(stat.avg) + '，最高' + self.one(stat.max) + '、最低' + self.one(stat.min))
        })
        return { lines: lines, summary: parts.length ? parts.join('。') + '。' : '' }
      },
      bodyTrend(rows) {
        const height = this.statOf(this.collect(rows, function(row) { return row.heightCm }))
        const weight = this.statOf(this.collect(rows, function(row) { return row.weightKg }))
        const lines = []
        const parts = []
        if (height) {
          lines.push('身高 平均 ' + this.one(height.avg) + ' 厘米 · 最高 ' + this.one(height.max) + ' · 最低 ' + this.one(height.min))
          parts.push('身高平均' + this.one(height.avg) + '厘米')
        }
        if (weight) {
          lines.push('体重 平均 ' + this.one(weight.avg) + ' 千克 · 最高 ' + this.one(weight.max) + ' · 最低 ' + this.one(weight.min))
          parts.push('体重平均' + this.one(weight.avg) + '千克，最高' + this.one(weight.max) + '、最低' + this.one(weight.min))
        }
        return { lines: lines, summary: parts.length ? parts.join('。') + '。' : '' }
      },
      sleepTrend(rows) {
        const hours = this.statOf(this.collect(rows, function(row) {
          const minutes = Number(row.durationMinutes)
          return Number.isFinite(minutes) ? minutes / 60 : NaN
        }))
        if (!hours) {
          return { lines: [], summary: '' }
        }
        const avg = this.one(hours.avg)
        const max = this.one(hours.max)
        const min = this.one(hours.min)
        return {
          lines: ['平均 ' + avg + ' 小时 · 最长 ' + max + ' 小时 · 最短 ' + min + ' 小时'],
          summary: '平均睡眠' + avg + '小时，最长' + max + '小时，最短' + min + '小时。'
        }
      },
      medicationTrend(rows) {
        const counts = {}
        const days = {}
        rows.forEach(function(row) {
          const name = String((row && row.drugName) || '').trim() || '未填药品'
          counts[name] = (counts[name] || 0) + 1
          const day = String((row && row.measureTime) || '').slice(0, 10)
          if (day) {
            days[day] = (days[day] || 0) + 1
          }
        })
        const names = Object.keys(counts).sort(function(left, right) {
          return counts[right] - counts[left]
        })
        const dayValues = Object.keys(days).map(function(day) {
          return days[day]
        })
        const lines = ['共 ' + rows.length + ' 次'].concat(names.map(function(name) {
          return name + ' ' + counts[name] + ' 次'
        }))
        let summary = '共' + rows.length + '次。' + names.map(function(name) {
          return name + counts[name] + '次'
        }).join('，') + '。'
        if (dayValues.length) {
          const maxDay = Math.max.apply(null, dayValues)
          const minDay = Math.min.apply(null, dayValues)
          lines.push('单日最多 ' + maxDay + ' 次 · 最少 ' + minDay + ' 次')
          summary += '单日最多' + maxDay + '次、最少' + minDay + '次。'
        }
        return { lines: lines, summary: summary }
      },
      allowed(code) {
        const permissions = this.$store.getters.permissions
        return !!(permissions && permissions.length && this.$auth.hasPermi(code))
      },
      typeOf(key) {
        return recordTypes.find(function(item) {
          return item.key === key
        }) || null
      },
      canAdd(item) {
        return item && this.allowed(item.perm + ':add')
      },
      canRemove(item) {
        return item && this.allowed(item.perm + ':remove')
      },
      glucoseLabel(value) {
        const found = this.glucoseTypes.find(function(item) {
          return item.value === String(value)
        })
        return found ? found.label : '空腹'
      },
      toggleAging() {
        this.aging = !this.aging
        uni.setStorageSync(AGING_KEY, this.aging ? '1' : '0')
      },
      timeQuery(section) {
        if (section.range === 'custom') {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(section.begin) || !/^\d{4}-\d{2}-\d{2}$/.test(section.end)) {
            return null
          }
          if (section.begin > section.end) {
            return null
          }
          return {
            beginTime: section.begin + ' 00:00:00',
            endTime: section.end + ' 23:59:59'
          }
        }
        return presetRange(section.range)
      },
      setRange(key, range) {
        const section = this.sections[key]
        section.range = range
        if (range === 'custom') {
          return
        }
        this.loadSection(key)
      },
      loadSection(key) {
        const type = this.typeOf(key)
        const section = this.sections[key]
        if (!type || !section || !this.elderlyId) {
          return
        }
        if (section.range === 'custom' && section.begin && section.end && section.begin > section.end) {
          this.$modal.msgError('开始日期不能晚于结束日期')
          return
        }
        const query = this.timeQuery(section)
        if (!query) {
          return
        }
        section.loading = true
        this.pullPages(type.path, query, 1, [], 0).then(result => {
          if (!result) {
            return
          }
          section.rows = result.rows
          section.total = result.total
          section.truncated = result.truncated
        }).catch(() => {}).finally(() => {
          section.loading = false
        })
      },
      pullPages(path, query, page, collected, knownTotal) {
        const self = this
        return listRecords(path, this.elderlyId, {
          pageNum: page,
          pageSize: 20,
          beginTime: query.beginTime,
          endTime: query.endTime
        }).then(function(res) {
          const batch = (res && res.rows) || []
          const total = res && res.total != null ? Number(res.total) : knownTotal
          const rows = collected.concat(batch)
          if (!batch.length || rows.length >= total || page >= PAGE_LIMIT) {
            return {
              rows: rows,
              total: total,
              truncated: rows.length < total
            }
          }
          return self.pullPages(path, query, page + 1, rows, total)
        })
      },
      onGlucoseType(key, event) {
        const item = this.glucoseTypes[Number(event.detail.value)]
        if (item) {
          this.sections[key].form.measureType = item.value
        }
      },
      summary(key, item) {
        if (key === 'bp') {
          const pulse = item.pulse != null && item.pulse !== '' ? ' 脉搏 ' + item.pulse : ''
          return item.measureTime + ' ' + item.systolic + '/' + item.diastolic + pulse
        }
        if (key === 'glucose') {
          return item.measureTime + ' ' + item.glucoseValue + ' ' + this.glucoseLabel(item.measureType)
        }
        if (key === 'body') {
          const bmi = item.bmi != null ? ' BMI ' + item.bmi : ''
          return item.measureTime + ' 身高 ' + item.heightCm + ' 体重 ' + item.weightKg + bmi
        }
        if (key === 'medication') {
          return item.measureTime + ' ' + item.drugName + ' ' + item.dosage
        }
        const duration = item.durationMinutes != null ? ' ' + item.durationMinutes + '分钟' : ''
        return item.sleepDate + ' ' + item.startTime + ' ' + item.endTime + duration
      },
      buildBody(key) {
        const form = this.sections[key].form
        const remark = form.remark
        if (key === 'bp') {
          const systolic = Number(form.systolic)
          const diastolic = Number(form.diastolic)
          if (!(systolic > diastolic)) {
            return '收缩压必须大于舒张压'
          }
          const body = {
            systolic: systolic,
            diastolic: diastolic,
            measureTime: form.measureTime,
            remark: remark
          }
          if (form.pulse !== '') {
            body.pulse = Number(form.pulse)
          }
          return body
        }
        if (key === 'glucose') {
          if (!(Number(form.glucoseValue) > 0)) {
            return '血糖值必须大于 0'
          }
          return {
            glucoseValue: Number(form.glucoseValue),
            measureType: form.measureType,
            measureTime: form.measureTime,
            remark: remark
          }
        }
        if (key === 'medication') {
          if (!form.drugName || !form.dosage || !form.measureTime) {
            return '请填写药品名称、用法或剂量和用药时间'
          }
          return {
            drugName: form.drugName,
            dosage: form.dosage,
            measureTime: form.measureTime,
            remark: remark
          }
        }
        if (key === 'body') {
          if (!(Number(form.heightCm) > 0) || !(Number(form.weightKg) > 0)) {
            return '身高和体重都必须大于 0'
          }
          return {
            heightCm: Number(form.heightCm),
            weightKg: Number(form.weightKg),
            measureTime: form.measureTime,
            remark: remark
          }
        }
        if (!form.sleepDate || !form.startTime || !form.endTime) {
          return '请填写睡眠日期和起止时间'
        }
        return {
          sleepDate: form.sleepDate,
          startTime: form.startTime,
          endTime: form.endTime,
          remark: remark
        }
      },
      submit(key) {
        const body = this.buildBody(key)
        if (typeof body === 'string') {
          this.$modal.msgError(body)
          return
        }
        if (Object.prototype.hasOwnProperty.call(body, 'measureTime') && !body.measureTime) {
          this.$modal.msgError('请填写测量时间')
          return
        }
        const type = this.typeOf(key)
        const section = this.sections[key]
        const self = this
        section.saving = true
        const persist = function() {
          saveRecord(type.path, self.elderlyId, body, false).then(res => {
            if (res && res.code === 200) {
              section.form = emptyForm()
              section.formOpen = false
              self.loadSection(key)
            }
          }).catch(() => {}).finally(() => {
            section.saving = false
          })
        }
        if (!this.elderlyId) {
          ensureOwnPerson().then(res => {
            const data = res && res.data
            if (!data || !data.elderlyId) {
              section.saving = false
              return
            }
            self.elderlyId = data.elderlyId
            if (data.name) {
              self.personName = data.name
            }
            persist()
          }).catch(() => {
            section.saving = false
          })
          return
        }
        persist()
      },
      remove(item, row) {
        const self = this
        uni.showModal({
          title: '删除记录',
          content: '删除这条' + item.label + '记录',
          success(result) {
            if (!result.confirm) {
              return
            }
            removeRecords(item.path, self.elderlyId, row.recordId).then(res => {
              if (res && res.code === 200) {
                self.loadSection(item.key)
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
    background: #f4f7fb;
    padding: 12px;
    box-sizing: border-box;
    color: #1a2b3c;
    font-size: 16px;
    line-height: 1.5;
    letter-spacing: 0.5px;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .title,
  .section-title {
    display: block;
    color: #222222;
    font-size: 18px;
    font-weight: 600;
    line-height: 1.5;
  }

  .aging-switch,
  .link,
  .danger {
    color: #0b57d0;
    font-size: 16px;
    font-weight: 500;
    line-height: 1.5;
  }

  .danger {
    color: #b42318;
  }

  .section {
    margin-bottom: 16px;
    padding: 14px;
    border-radius: 16px;
    background: #ffffff;
    box-shadow: 0 8px 24px rgba(21, 74, 140, 0.06);
  }

  .block-label {
    display: block;
    margin-top: 8px;
    color: #0b57d0;
    font-size: 16px;
    font-weight: 600;
    line-height: 1.5;
  }

  .action-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 12px;
  }

  .inline {
    display: inline;
    flex: 1;
    min-width: 0;
    margin-top: 0;
  }

  .action-btns {
    display: flex;
    flex-shrink: 0;
    align-items: center;
  }

  .side-btn {
    margin-left: 8px;
    padding: 8px 12px;
    border-radius: 12px;
    background: #0b57d0;
    color: #ffffff;
    font-size: 15px;
    font-weight: 600;
    line-height: 1.4;
    text-align: center;
  }

  .ghost {
    background: #e8f1ff;
    color: #0b57d0;
  }

  .stats,
  .stat,
  .summary {
    display: block;
  }

  .stat,
  .summary {
    margin-top: 6px;
    color: #1a2b3c;
    font-size: 16px;
    line-height: 1.5;
  }

  .summary {
    color: #3d4f63;
  }

  .summary-block {
    margin-top: 12px;
  }

  .ranges {
    display: flex;
    flex-wrap: wrap;
    margin-top: 8px;
  }

  .chip {
    margin: 0 8px 8px 0;
    padding: 4px 10px;
    border-radius: 14px;
    background: #f4f7fb;
    color: #1a2b3c;
    font-size: 16px;
    font-weight: 500;
    line-height: 1.5;
  }

  .on {
    background: #e8f1ff;
    color: #0b57d0;
  }

  .card {
    margin-top: 8px;
  }

  .line,
  .hint {
    display: block;
    color: #3d4f63;
    font-size: 16px;
    font-weight: 500;
    line-height: 1.5;
  }

  .hint {
    font-size: 14px;
  }

  .popup {
    padding: 16px 16px 24px;
    background: #ffffff;
    border-radius: 16px 16px 0 0;
  }

  .popup-list {
    height: 46vh;
    margin-top: 8px;
  }

  .popup-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 0;
    border-bottom: 1px solid #e8eef5;
  }

  .popup-row .line {
    flex: 1;
    min-width: 0;
    margin-right: 12px;
  }

  .close {
    display: block;
    margin-top: 12px;
    text-align: center;
  }

  .save {
    margin-top: 8px;
    background-color: #0b57d0;
    font-size: 16px;
  }

  .field {
    width: 100%;
    height: 44px;
    box-sizing: border-box;
    margin: 8px 0;
    padding: 0 10px;
    border-radius: 8px;
    background: #f4f7fb;
    color: #222222;
    font-size: 16px;
    line-height: 1.5;
  }

  .aging {
    color: #111111;
    font-size: 18px;
    font-weight: 600;
  }

  .aging .title,
  .aging .section-title,
  .aging .block-label,
  .aging .chip,
  .aging .stat,
  .aging .summary,
  .aging .line,
  .aging .hint,
  .aging .field,
  .aging .link,
  .aging .danger,
  .aging .aging-switch {
    color: #111111;
    font-size: 18px;
    font-weight: 600;
  }

  .aging .on,
  .aging .link,
  .aging .danger {
    color: #ffffff;
  }

  .aging .link {
    color: #0842a0;
  }

  .aging .danger {
    color: #8c1d18;
  }

  .aging .on {
    background: #0842a0;
    color: #ffffff;
  }

  .aging .side-btn {
    color: #ffffff;
    font-size: 18px;
  }

  .aging .ghost {
    color: #0842a0;
  }
</style>
