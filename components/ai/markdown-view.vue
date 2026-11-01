<template>
  <view class="md" :class="{ 'md-home': home }">
    <view v-for="(block, index) in blocks" :key="index" class="md-block">
      <view v-if="block.type === 'code'" class="code-block">
        <view class="code-head">
          <text v-if="block.lang" class="code-lang">{{ block.lang }}</text>
          <text class="code-copy" @click="copyCode(block.text)">复制代码</text>
        </view>
        <scroll-view scroll-x class="code-scroll">
          <text class="code-text" selectable>{{ block.text }}</text>
        </scroll-view>
      </view>
      <view v-else-if="block.type === 'heading'" class="md-heading" :class="'md-h' + block.level">
        <text v-for="(part, partIndex) in block.inlines" :key="partIndex" :class="partClass(part)">{{ part.text }}</text>
      </view>
      <view v-else-if="block.type === 'list'">
        <view v-for="(item, itemIndex) in block.items" :key="itemIndex" class="md-li">
          <text class="md-mark">{{ block.ordered ? (itemIndex + 1) + '.' : '•' }}</text>
          <view class="md-li-body">
            <text v-for="(part, partIndex) in item" :key="partIndex" :class="partClass(part)">{{ part.text }}</text>
          </view>
        </view>
      </view>
      <view v-else class="md-p">
        <text v-for="(part, partIndex) in block.inlines" :key="partIndex" :class="partClass(part)">{{ part.text }}</text>
      </view>
    </view>
  </view>
</template>

<script>
  import { parseMarkdown } from '@/components/ai/markdown.js'

  export default {
    props: {
      content: {
        type: String,
        default: ''
      },
      home: {
        type: Boolean,
        default: false
      }
    },
    computed: {
      blocks() {
        return parseMarkdown(this.content)
      }
    },
    methods: {
      partClass(part) {
        return 'md-' + (part.type || 'text')
      },
      copyCode(text) {
        uni.setClipboardData({
          data: text || ''
        })
      }
    }
  }
</script>

<style lang="scss" scoped>
  .md-block {
    margin-bottom: 8px;
  }

  .md-block:last-child {
    margin-bottom: 0;
  }

  .md-p,
  .md-heading,
  .md-li-body {
    line-height: 1.6;
    word-break: break-word;
  }

  .md-h1 {
    font-size: 18px;
    font-weight: 600;
  }

  .md-h2 {
    font-size: 16px;
    font-weight: 600;
  }

  .md-h3 {
    font-size: 15px;
    font-weight: 600;
  }

  .md-home .md-p,
  .md-home .md-li-body {
    font-size: 20px;
  }

  .md-home .md-h1 {
    font-size: 22px;
  }

  .md-home .md-h2,
  .md-home .md-h3 {
    font-size: 20px;
  }

  .md-bold {
    font-weight: 600;
  }

  .md-italic {
    font-style: italic;
  }

  .md-code {
    font-family: Consolas, Monaco, monospace;
    background: rgba(0, 0, 0, 0.06);
    padding: 0 4px;
    border-radius: 4px;
  }

  .md-li {
    display: flex;
    align-items: flex-start;
    margin-bottom: 4px;
  }

  .md-mark {
    width: 22px;
    flex-shrink: 0;
    color: #666;
  }

  .code-block {
    background: #1e1e1e;
    border-radius: 8px;
    padding: 8px 10px;
  }

  .code-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  .code-lang {
    color: #9cdcfe;
    font-size: 12px;
  }

  .code-copy {
    color: #9cdcfe;
    font-size: 12px;
  }

  .code-scroll {
    width: 100%;
  }

  .code-text {
    color: #f3f3f3;
    font-family: Consolas, Monaco, monospace;
    font-size: 13px;
    line-height: 1.5;
    white-space: pre;
  }
</style>
