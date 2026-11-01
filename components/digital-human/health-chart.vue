<template>
  <view class="health-chart">
    <view
      v-if="option"
      class="chart-host"
      :prop="payload"
      :change:prop="chartRender.apply"
    ></view>
    <text v-if="failed" class="chart-fail">图表没有载入，记录仍在上方文字里。</text>
  </view>
</template>

<script>
  import { buildHealthOption } from '@/components/digital-human/health-option'

  export default {
    props: {
      kind: {
        type: String,
        default: ''
      },
      records: {
        type: Array,
        default: function() {
          return []
        }
      },
      aging: {
        type: Boolean,
        default: false
      },
      sleepHours: {
        type: Boolean,
        default: false
      }
    },
    data() {
      return {
        paint: 0,
        failed: false
      }
    },
    computed: {
      option() {
        return buildHealthOption(this.kind, this.records, {
          aging: this.aging,
          sleepHours: this.sleepHours
        })
      },
      payload() {
        return {
          paint: this.paint,
          option: this.option
        }
      }
    },
    watch: {
      records: {
        deep: true,
        handler() {
          this.failed = false
          this.paint += 1
        }
      },
      aging() {
        this.paint += 1
      },
      sleepHours() {
        this.paint += 1
      }
    },
    mounted() {
      this.$nextTick(() => {
        this.paint += 1
      })
    },
    methods: {
      onChartFail() {
        this.failed = true
      }
    }
  }
</script>

<script module="chartRender" lang="renderjs">
  var loading = null

  function echartsUrl() {
    if (typeof plus !== 'undefined' && plus.io && plus.io.convertLocalFileSystemURL) {
      var path = plus.io.convertLocalFileSystemURL('_www/static/echarts.min.js')
      if (path.indexOf('file:') !== 0 && path.indexOf('http') !== 0 && path.indexOf('/') === 0) {
        return 'file://' + path
      }
      return path
    }
    return '/static/echarts.min.js'
  }

  function loadEcharts() {
    if (typeof window !== 'undefined' && window.echarts) {
      return Promise.resolve(window.echarts)
    }
    if (loading) {
      return loading
    }
    loading = new Promise(function(resolve, reject) {
      var script = document.createElement('script')
      script.src = echartsUrl()
      script.onload = function() {
        if (window.echarts) {
          resolve(window.echarts)
          return
        }
        reject(new Error('echarts missing'))
      }
      script.onerror = function() {
        loading = null
        reject(new Error('echarts load failed'))
      }
      document.head.appendChild(script)
    })
    return loading
  }

  export default {
    mounted() {
      var self = this
      this.onResize = function() {
        if (self.chart) {
          self.chart.resize()
        }
      }
      window.addEventListener('resize', this.onResize)
    },
    beforeDestroy() {
      window.removeEventListener('resize', this.onResize)
      if (this.chart) {
        this.chart.dispose()
        this.chart = null
      }
    },
    methods: {
      apply(payload) {
        var option = payload && payload.option
        var self = this
        if (!option) {
          if (this.chart) {
            this.chart.dispose()
            this.chart = null
          }
          return
        }
        loadEcharts().then(function(echarts) {
          var host = self.$el
          if (host && host.querySelector) {
            host = host.querySelector('.chart-host') || host
          }
          if (self.chart && self.chart.getDom && self.chart.getDom() !== host) {
            self.chart.dispose()
            self.chart = null
          }
          if (!self.chart) {
            self.chart = echarts.init(host)
          }
          self.chart.setOption(option, true)
          self.chart.resize()
        }).catch(function() {
          if (self.$ownerInstance) {
            self.$ownerInstance.callMethod('onChartFail')
          }
        })
      }
    }
  }
</script>

<style scoped>
  .health-chart {
    margin-top: 8px;
  }

  .chart-host {
    width: 100%;
    height: 180px;
    background: #fff;
    border-radius: 8px;
  }

  .chart-fail {
    display: block;
    color: #595959;
    font-size: 14px;
    line-height: 1.5;
  }
</style>
