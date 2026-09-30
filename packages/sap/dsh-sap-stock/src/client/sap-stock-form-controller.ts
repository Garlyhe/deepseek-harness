/**
 * SAP 登录配置表单的暂存模型:把 sap-stock 命名空间的 scope 投影成
 * 两个字段(loginUser / loginPassword)的表单状态与保存动作。
 * loginPassword 是 role('secret') 字段:只写、不回显。
 */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  SettingsFormModel, settingsTextField,
  type SettingsFieldState, type SettingsFormActions, type SettingsFormScope, type SettingsFormShell,
} from '@deepseek-ai/dsh-client-ui-primitives'

/** 宿主插件在 profile 里的条目 id(settings 命名空间)。 */
export const SAP_STOCK_NS = 'sap-stock'
/** plugins.row.config 槽位的 key:<包名>#<行 id>。 */
export const SAP_STOCK_SLOT_KEY = 'dsh-sap-stock#sap-stock'

export interface SapStockSettings {
  loginUser?: string
  loginPassword?: string
}

export interface SapStockCardState extends SettingsFormShell {
  loginUser: SettingsFieldState
  loginPassword: SettingsFieldState
}

export interface SapStockCardFace extends SettingsFormActions {
  hooks: { sapStock: SnapshotStore<SapStockCardState> }
}

/** 把 settings scope 桥接到表单状态与动作。 */
export class SapStockFormController {
  private readonly form: SettingsFormModel<SapStockSettings>
  private readonly store: SnapshotStore<SapStockCardState>
  private readonly scope: SettingsFormScope<SapStockSettings>

  constructor(scope: SettingsFormScope<SapStockSettings>) {
    this.scope = scope
    this.form = new SettingsFormModel(
      scope,
      [settingsTextField('loginUser')],
      [{ field: 'loginPassword', write: text => this.writePassword(text) }],
    )
    this.store = this.form.bind(() => this.projection())
  }

  /** 写密码:通过 settings mutate 写入 loginPassword(role('secret') 字段)。 */
  private async writePassword(text: string): Promise<boolean> {
    return this.scope.mutate([{ op: 'set', path: ['loginPassword'], value: text }])
  }

  private projection(): SapStockCardState {
    return {
      ...this.form.shell(),
      loginUser: this.form.field('loginUser'),
      loginPassword: this.form.field('loginPassword'),
    }
  }

  /** 槽位注册时注入的表单状态与动作。 */
  inject(): SapStockCardFace {
    return { hooks: { sapStock: this.store }, ...this.form.actions() }
  }

  dispose(): void { this.form.dispose() }
}
