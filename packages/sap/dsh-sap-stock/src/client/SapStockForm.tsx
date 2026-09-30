/**
 * SAP 登录配置表单:登录账号 + 登录密码,保存即写入 sap-stock 命名空间。
 */
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { SettingsForm, SettingsSecretField, SettingsValueField } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SapStockCardFace } from './sap-stock-form-controller.ts'

export type SapStockFormProps =
  PropsRuntime<'plugins.row.config'>
  & InjectFace<SapStockCardFace>

export function SapStockForm(props: SapStockFormProps) {
  const state = props.useSapStock(snapshot => snapshot)
  if (props.view === 'summary') return 'SAP 登录账号与密码'
  const disabled = !state.writable
  return (
    <SettingsForm
      labels={{
        unavailable: '该插件未启用',
        readOnly: '当前配置为只读',
        saveFailed: '保存失败',
        save: '保存',
        saving: '保存中…',
      }}
      state={state}
      onSave={props.save}
      onDiscard={props.discard}
    >
      <SettingsValueField
        id="sap-stock-login-user"
        label="登录账号 (User ID)"
        hint="用于 ZDSH_LOGIN 验证,例如 HECW"
        overriddenLabel="已覆盖"
        resetLabel="重置"
        invalidLabel="无效值"
        disabled={disabled}
        {...state.loginUser}
        onEdit={(text) => { props.edit('loginUser', text) }}
        onReset={() => { props.resetField('loginUser') }}
      />
      <SettingsSecretField
        id="sap-stock-login-password"
        label="登录密码 (Password)"
        hint="只写不回显;留空表示不修改"
        disabled={disabled}
        configured={false}
        stateLabel="保存后不回显"
        text={state.loginPassword.text}
        onEdit={(text) => { props.edit('loginPassword', text) }}
      />
    </SettingsForm>
  )
}
