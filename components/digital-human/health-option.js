function num(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function timeKey(row) {
  return String((row && (row.measureTime || row.startTime || row.sleepDate)) || '')
}

function sortedRows(records) {
  return (records || []).slice().sort(function(left, right) {
    const a = timeKey(left)
    const b = timeKey(right)
    if (a < b) {
      return -1
    }
    if (a > b) {
      return 1
    }
    return 0
  })
}

function hasNumber(values) {
  return values.some(function(value) {
    return value != null
  })
}

function chartText(options) {
  const aging = !!(options && options.aging)
  return {
    fontSize: aging ? 14 : 12,
    fontWeight: aging ? 600 : 500,
    color: aging ? '#111111' : '#222222'
  }
}

function lineOption(labels, series, unit, options) {
  const usable = series.filter(function(item) {
    return item && hasNumber(item.data)
  })
  if (!usable.length) {
    return null
  }
  const text = chartText(options)
  const width = options && options.aging ? 3 : 2
  return {
    animation: false,
    textStyle: text,
    grid: { left: 48, right: 16, top: 36, bottom: 32 },
    tooltip: { trigger: 'axis', confine: true, textStyle: text },
    legend: { top: 0, textStyle: text },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: Object.assign({ hideOverlap: true }, text)
    },
    yAxis: {
      type: 'value',
      name: unit || '',
      scale: true,
      nameTextStyle: text,
      axisLabel: text
    },
    series: usable.map(function(item) {
      return {
        name: item.name,
        type: item.type || 'line',
        stack: item.stack,
        data: item.data,
        connectNulls: false,
        showSymbol: true,
        lineStyle: { width: width },
        itemStyle: { borderWidth: width }
      }
    })
  }
}

function pressureOption(rows, options) {
  return lineOption(rows.map(timeKey), [
    { name: '收缩压', data: rows.map(function(row) { return num(row.systolic) }) },
    { name: '舒张压', data: rows.map(function(row) { return num(row.diastolic) }) },
    { name: '脉搏', data: rows.map(function(row) { return num(row.pulse) }) }
  ], 'mmHg', options)
}

function glucoseOption(rows, options) {
  const labels = rows.map(timeKey)
  const names = { '1': '空腹', '2': '餐后', '3': '随机' }
  const groups = {}
  rows.forEach(function(row, index) {
    const key = row && row.measureType != null && row.measureType !== '' ? String(row.measureType) : '0'
    if (!groups[key]) {
      groups[key] = labels.map(function() { return null })
    }
    groups[key][index] = num(row.glucoseValue)
  })
  const series = Object.keys(groups).map(function(key) {
    return { name: names[key] || '血糖', data: groups[key] }
  })
  return lineOption(labels, series, 'mmol/L', options)
}

function bodyOption(rows, options) {
  const labels = rows.map(timeKey)
  const height = rows.map(function(row) { return num(row.heightCm) })
  const weight = rows.map(function(row) { return num(row.weightKg) })
  if (!hasNumber(height) && !hasNumber(weight)) {
    return null
  }
  const series = []
  if (hasNumber(height)) {
    series.push({ name: '身高', type: 'line', yAxisIndex: 0, data: height, connectNulls: false })
  }
  if (hasNumber(weight)) {
    series.push({ name: '体重', type: 'line', yAxisIndex: 1, data: weight, connectNulls: false })
  }
  const width = options && options.aging ? 3 : 2
  series.forEach(function(item) {
    item.lineStyle = { width: width }
  })
  return {
    animation: false,
    grid: { left: 44, right: 44, top: 28, bottom: 28 },
    tooltip: { trigger: 'axis', confine: true },
    textStyle: chartText(options),
    legend: { top: 0, textStyle: chartText(options) },
    xAxis: { type: 'category', data: labels, axisLabel: Object.assign({ hideOverlap: true }, chartText(options)) },
    yAxis: [
      { type: 'value', name: 'cm', scale: true, nameTextStyle: chartText(options), axisLabel: chartText(options) },
      { type: 'value', name: 'kg', scale: true, nameTextStyle: chartText(options), axisLabel: chartText(options) }
    ],
    series: series
  }
}

function sleepOption(rows, options) {
  const asHours = !!(options && options.sleepHours)
  return lineOption(rows.map(function(row) {
    return String((row && (row.sleepDate || row.startTime)) || '')
  }), [
    {
      name: '睡眠时长',
      data: rows.map(function(row) {
        const minutes = num(row && row.durationMinutes)
        if (minutes == null) {
          return null
        }
        if (!asHours) {
          return minutes
        }
        return Math.round(minutes / 6) / 10
      })
    }
  ], asHours ? '小时' : '分钟', options)
}

function dayKey(value) {
  const text = String(value || '')
  return text.length >= 10 ? text.slice(0, 10) : text
}

function medicationOption(rows, options) {
  const days = []
  const drugs = {}
  rows.forEach(function(row) {
    const day = dayKey(row && row.measureTime)
    const name = String((row && row.drugName) || '').trim()
    if (!day || !name) {
      return
    }
    if (days.indexOf(day) < 0) {
      days.push(day)
    }
    if (!drugs[name]) {
      drugs[name] = {}
    }
    drugs[name][day] = (drugs[name][day] || 0) + 1
  })
  days.sort()
  const names = Object.keys(drugs)
  if (!days.length || !names.length) {
    return null
  }
  return lineOption(days, names.map(function(name) {
    return {
      name: name,
      type: 'bar',
      stack: 'medication',
      data: days.map(function(day) {
        return drugs[name][day] || 0
      })
    }
  }), '次', options)
}

/**
 * 只用查询帧里的 records 生成 ECharts 配置。没有数值时返回 null。
 * @param {'bp'|'glucose'|'body'|'sleep'|'medication'} kind
 * @param {Array<object>} records
 * @param {{aging?: boolean, sleepHours?: boolean}} [options]
 */
export function buildHealthOption(kind, records, options) {
  const rows = sortedRows(records)
  if (!rows.length) {
    return null
  }
  if (kind === 'bp') {
    return pressureOption(rows, options)
  }
  if (kind === 'glucose') {
    return glucoseOption(rows, options)
  }
  if (kind === 'body') {
    return bodyOption(rows, options)
  }
  if (kind === 'sleep') {
    return sleepOption(rows, options)
  }
  if (kind === 'medication') {
    return medicationOption(rows, options)
  }
  return null
}
