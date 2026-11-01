<template>
  <view class="page">
    <view class="card">
      <text class="label">部门</text>
      <picker v-if="depts.length" :range="depts" range-key="deptName" @change="onDept">
        <view class="field">{{ deptName || '选择部门' }}</view>
      </picker>
      <input v-else class="field" v-model="form.deptId" type="number" placeholder="部门编号" />
      <text class="label">姓名</text>
      <input class="field" v-model="form.name" maxlength="30" placeholder="最长 30 字" />
      <text class="label">性别</text>
      <picker :range="sexOptions" range-key="label" @change="onSex">
        <view class="field">{{ sexLabel }}</view>
      </picker>
      <text class="label">身份证</text>
      <input class="field" v-model="form.idCard" maxlength="18" placeholder="18 位，末位可为 X。编辑时脱敏值原样提交" />
      <text class="label">出生日期</text>
      <input class="field" v-model="form.birthday" placeholder="yyyy-MM-dd" />
      <text class="label">电话</text>
      <input class="field" v-model="form.phonenumber" maxlength="11" placeholder="不要自行打星号" />
      <text class="label">紧急联系人</text>
      <input class="field" v-model="form.emergencyContact" maxlength="30" />
      <text class="label">紧急联系人电话</text>
      <input class="field" v-model="form.emergencyPhone" maxlength="11" />
      <text class="label">住址</text>
      <input class="field" v-model="form.address" maxlength="200" />
      <text class="label">状态</text>
      <picker :range="statusOptions" range-key="label" @change="onStatus">
        <view class="field">{{ form.status === '1' ? '停用' : '正常' }}</view>
      </picker>
      <text class="label">备注</text>
      <textarea class="area" v-model="form.remark" maxlength="500" />
      <button type="primary" :disabled="saving" @click="submit">保存</button>
    </view>
  </view>
</template>

<script>
  import { getPerson, savePerson } from '@/api/elderly/person'
  import { listDept } from '@/api/system/dept'

  function emptyForm() {
    return {
      elderlyId: null,
      deptId: '',
      name: '',
      sex: '0',
      idCard: '',
      birthday: '',
      phonenumber: '',
      address: '',
      emergencyContact: '',
      emergencyPhone: '',
      status: '0',
      remark: ''
    }
  }

  export default {
    data() {
      return {
        form: emptyForm(),
        depts: [],
        saving: false,
        sexOptions: [
          { value: '0', label: '男' },
          { value: '1', label: '女' },
          { value: '2', label: '未知' }
        ],
        statusOptions: [
          { value: '0', label: '正常' },
          { value: '1', label: '停用' }
        ]
      }
    },
    computed: {
      editing() {
        return this.form.elderlyId != null && this.form.elderlyId !== ''
      },
      deptName() {
        const id = this.form.deptId
        const found = this.depts.find(function(item) {
          return String(item.deptId) === String(id)
        })
        return found ? found.deptName : ''
      },
      sexLabel() {
        const sex = this.form.sex
        const found = this.sexOptions.find(function(item) {
          return item.value === sex
        })
        return found ? found.label : '未知'
      }
    },
    onLoad(options) {
      this.loadDepts()
      if (options && options.elderlyId) {
        this.loadDetail(options.elderlyId)
      }
    },
    methods: {
      allowed(code) {
        const permissions = this.$store.getters.permissions
        return permissions && permissions.length && this.$auth.hasPermi(code)
      },
      flattenDepts(list, output) {
        const self = this
        ;(list || []).forEach(function(item) {
          output.push(item)
          if (item.children && item.children.length) {
            self.flattenDepts(item.children, output)
          }
        })
      },
      loadDepts() {
        if (!this.allowed('system:dept:list')) {
          return
        }
        listDept().then(res => {
          const raw = (res && (res.data || res.rows)) || []
          const output = []
          this.flattenDepts(raw, output)
          this.depts = output
        }).catch(() => {})
      },
      loadDetail(elderlyId) {
        getPerson(elderlyId).then(res => {
          const data = res && res.data
          if (!data) {
            return
          }
          this.form = Object.assign(emptyForm(), {
            elderlyId: data.elderlyId,
            deptId: data.deptId,
            name: data.name || '',
            sex: data.sex || '2',
            idCard: data.idCard || '',
            birthday: data.birthday || '',
            phonenumber: data.phonenumber || '',
            address: data.address || '',
            emergencyContact: data.emergencyContact || '',
            emergencyPhone: data.emergencyPhone || '',
            status: data.status || '0',
            remark: data.remark || ''
          })
        }).catch(() => {})
      },
      onDept(event) {
        const item = this.depts[Number(event.detail.value)]
        if (item) {
          this.form.deptId = item.deptId
        }
      },
      onSex(event) {
        const item = this.sexOptions[Number(event.detail.value)]
        if (item) {
          this.form.sex = item.value
        }
      },
      onStatus(event) {
        const item = this.statusOptions[Number(event.detail.value)]
        if (item) {
          this.form.status = item.value
        }
      },
      submit() {
        if (this.saving) {
          return
        }
        if (!this.form.deptId) {
          this.$modal.msgError('请填写部门')
          return
        }
        if (!this.form.name || !String(this.form.name).trim()) {
          this.$modal.msgError('请填写姓名')
          return
        }
        if (!this.editing) {
          const card = String(this.form.idCard || '').trim()
          if (!/^\d{17}[\dXx]$/.test(card)) {
            this.$modal.msgError('身份证号格式不正确')
            return
          }
          this.form.idCard = card.toUpperCase()
        }
        const permit = this.editing ? 'elderly:person:edit' : 'elderly:person:add'
        if (!this.allowed(permit)) {
          this.$modal.msgError('没有保存权限')
          return
        }
        this.saving = true
        savePerson(this.form, this.editing).then(res => {
          if (res && res.code === 200) {
            this.$modal.msgSuccess('已保存')
            this.$tab.navigateBack()
          }
        }).catch(() => {}).finally(() => {
          this.saving = false
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

  .card {
    background: #fff;
    border-radius: 10px;
    padding: 12px;
  }

  .label {
    display: block;
    margin: 8px 0 4px;
    color: #666;
    font-size: 12px;
  }

  .field,
  .area {
    width: 100%;
    box-sizing: border-box;
    background: #f5f6f7;
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 14px;
  }

  .field {
    height: 36px;
  }

  .area {
    min-height: 72px;
    margin-bottom: 12px;
  }
</style>
