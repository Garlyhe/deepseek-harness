/**
 * dsh-sap-stock 客户端伴生包入口:把 SAP 登录配置表单挂到插件页的
 * plugins.row.config 槽位(key = dsh-sap-stock#sap-stock)。
 */
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { SapStockFormController, SAP_STOCK_NS, SAP_STOCK_SLOT_KEY } from './sap-stock-form-controller.ts'
import { SapStockForm } from './SapStockForm.tsx'

export const inject = ['slots', 'configForms']

export function apply(ctx: ClientContext): void {
  const controller = new SapStockFormController(ctx.configForms.get(SAP_STOCK_NS))
  ctx.effect(() => () => { controller.dispose() }, 'dsh-sap-stock: form subscription')
  ctx.effect(() => ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
    name: 'plugins.row.config',
    key: SAP_STOCK_SLOT_KEY,
    inject: () => controller.inject(),
  }, SapStockForm)), 'dsh-sap-stock: config page')
}
