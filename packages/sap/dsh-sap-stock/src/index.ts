/**
 * dsh-sap-stock 宿主半侧(monorepo 包结构:src/index.ts)。
 * 自带独立 Python 桥(bridge.py)调用 SAP,不依赖 sapconnect-dsh。
 * SAP 连接参数(服务账号)与登录账号(loginUser/loginPassword)都在插件配置里,
 * loginUser/loginPassword 由客户端伴生包的表单编辑。
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context, Volatile } from '@deepseek-ai/cordis'
// 类型声明合并:loader/volatile-update 事件(loader)
import type {} from '@deepseek-ai/cordis-plugin-loader'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
// 自带桥(相对 lib/ 或 src/ 上一级的 python/bridge.py)
const BRIDGE_PATH = path.resolve(moduleDir, '..', 'python', 'bridge.py')

export const name = 'dsh-sap-stock'
export const inject = ['tools']

export interface Config {
  python: string
  sdkLib: string
  timeoutMs: number
  ashost: string
  sysnr: string
  client: string
  user: string
  passwd: string
  lang: string
  loginUser: Volatile<string | undefined>
  loginPassword: Volatile<string | undefined>
  rfcLogin: string
  rfcStock: string
}

export const Config = z.object({
  // Python 桥 + SDK
  python: z.string().default('python'),
  sdkLib: z.string().default(''),
  timeoutMs: z.number().default(120000),
  // SAP 服务账号(连 SAP 用)
  ashost: z.string().default(''),
  sysnr: z.string().default(''),
  client: z.string().default(''),
  user: z.string().default(''),
  passwd: z.string().role('secret').default(''),
  lang: z.string().default('EN'),
  // 登录账号密码(volatile,表单编辑)
  loginUser: z.string().volatile(),
  loginPassword: z.string().role('secret').volatile(),
  // RFC 函数名
  rfcLogin: z.string().default('ZDSH_LOGIN'),
  rfcStock: z.string().default('ZDSH_GET_STOCK'),
})

function firstError(returns: unknown): string | null {
  for (const r of (returns as Array<{ TYPE?: string; ID?: string; NUMBER?: string; MESSAGE?: string }>) ?? []) {
    if (r?.TYPE === 'E' || r?.TYPE === 'A') {
      return r?.MESSAGE ?? `SAP 错误(${r?.ID ?? ''} ${r?.NUMBER ?? ''})`
    }
  }
  return null
}

function hasSuccess(returns: unknown): boolean {
  return ((returns as Array<{ TYPE?: string }>) ?? []).some(r => r?.TYPE === 'S')
}

function readVolatile<T>(v: Volatile<T> | T | undefined): T | undefined {
  if (v == null) return undefined
  return typeof (v as Volatile<T>).get === 'function' ? (v as Volatile<T>).get() as T : (v as T)
}

interface BridgeMessage {
  id?: number
  result?: unknown
  error?: string
}

export function apply(ctx: Context, config: Config): void {
  const session = { userId: null as string | null, username: null as string | null }
  // 登录失败缓存:失败后不再反复尝试,直到配置变更才重置
  let loginError: string | null = null

  // ---- 自带 Python 桥客户端 ----
  let proc: ReturnType<typeof spawn> | null = null
  let nextId = 1
  let stdoutBuffer = ''
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>()

  function ensureBridge(): ReturnType<typeof spawn> {
    if (proc && proc.exitCode === null && proc.killed === false) return proc
    proc = spawn(config.python, [BRIDGE_PATH], {
      env: {
        ...process.env,
        SAPNWRFC_SDK_LIB: config.sdkLib,
        SAP_USER: config.user,
        SAP_PASSWORD: config.passwd,
        SAP_ASHOST: config.ashost,
        SAP_SYSNR: config.sysnr,
        SAP_CLIENT: config.client,
        SAP_LANG: config.lang,
      },
      stdio: ['pipe', 'pipe', 'inherit'],
      windowsHide: true,
    })
    proc.stdout!.setEncoding('utf8')
    proc.stdout!.on('data', (chunk: string) => {
      stdoutBuffer += chunk
      let idx: number
      while ((idx = stdoutBuffer.indexOf('\n')) >= 0) {
        const line = stdoutBuffer.slice(0, idx).trim()
        stdoutBuffer = stdoutBuffer.slice(idx + 1)
        if (!line) continue
        let msg: BridgeMessage
        try { msg = JSON.parse(line) } catch { continue }
        const entry = pending.get(msg.id!)
        if (!entry) continue
        pending.delete(msg.id!)
        clearTimeout(entry.timer)
        if (msg.error) entry.reject(new Error(msg.error))
        else entry.resolve(msg.result)
      }
    })
    proc.on('exit', (code: number | null) => {
      proc = null
      if (pending.size) {
        const err = new Error(`bridge exited unexpectedly (code ${code})`)
        for (const [, entry] of pending) {
          clearTimeout(entry.timer)
          entry.reject(err)
        }
        pending.clear()
      }
    })
    return proc
  }

  function bridgeCall(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let p: ReturnType<typeof spawn>
      try { p = ensureBridge() } catch (err) { reject(err); return }
      const id = nextId++
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`bridge call timeout after ${config.timeoutMs}ms (${method})`))
      }, config.timeoutMs)
      pending.set(id, { resolve, reject, timer })
      try { p.stdin!.write(JSON.stringify({ id, method, params }) + '\n') } catch (err) {
        pending.delete(id); clearTimeout(timer); reject(err)
      }
    })
  }

  ctx.effect(() => () => {
    if (proc && proc.exitCode === null) {
      try { proc.stdin!.end(); proc.kill() } catch { /* already gone */ }
    }
  })

  async function callRfc(functionName: string, parameters: Record<string, unknown>): Promise<Record<string, any>> {
    return (await bridgeCall('rfc_call', { function_name: functionName, parameters })) as Record<string, any>
  }

  // ---- 登录:失败即缓存错误,不重试 ----
  async function login(): Promise<{ ok: true; username: string }> {
    if (loginError) throw new Error(loginError)
    const u = readVolatile(config.loginUser) ?? ''
    const p = readVolatile(config.loginPassword) ?? ''
    if (!u || !p) {
      loginError = '未配置登录账号/密码,请先在插件配置里填写并保存'
      throw new Error(loginError)
    }
    try {
      const res = await callRfc(config.rfcLogin, { I_USERID: u, I_PASSWORD: p })
      const err = firstError(res.ET_RETURN)
      if (err) throw new Error(`SAP 登录失败: ${err}`)
      if (!hasSuccess(res.ET_RETURN)) throw new Error('SAP 登录失败(未返回成功标识)')
      session.userId = u
      session.username = String(res.E_USERNAME ?? u)
      loginError = null
      return { ok: true, username: session.username }
    } catch (err) {
      loginError = (err as Error)?.message ?? String(err)
      throw err
    }
  }

  // 配置变更后重置登录态与失败缓存,允许用新凭据重试
  ctx.on('loader/volatile-update', () => {
    session.userId = null
    session.username = null
    loginError = null
  })

  ctx.provide('sapSession', {
    get userId() { return session.userId },
    get username() { return session.username },
  })

  ctx.tools.register(defineTool({
    name: 'get_stock',
    description: '查询某工厂某物料的当前库存(非限制使用量)。',
    parameters: {
      werks: { type: 'string', required: true, description: '工厂(Plant)编号' },
      matnr: { type: 'string', required: true, description: '物料号(Material Number)' },
    },
    output: {
      schema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            werks: { type: 'string', required: true },
            matnr: { type: 'string', required: true },
            lgort: { type: 'string', required: true },
            labst: { type: 'string', required: true },
            meins: { type: 'string', required: true },
          },
          additionalProperties: false,
        },
      },
      render: (_args: unknown, value: Array<Record<string, string>>) => [
        { type: 'text', text: value.length === 0 ? '(无库存数据)' : JSON.stringify(value, null, 2) },
      ],
    },
    async execute(args: { werks: string; matnr: string }, exec: { signal: AbortSignal }) {
      if (!session.userId) await login()
      exec.signal.throwIfAborted()
      const res = await callRfc(config.rfcStock, {
        I_USERID: session.userId,
        I_WERKS: args.werks,
        I_MATNR: args.matnr,
      })
      const err = firstError(res.ET_RETURN)
      if (err) throw new Error(err)
      const rows = (res.ET_STOCK ?? []) as Array<Record<string, unknown>>
      return rows.map(row => ({
        werks: String(row.WERKS ?? '').trim(),
        matnr: String(row.MATNR ?? '').trim(),
        lgort: String(row.LGORT ?? '').trim(),
        labst: String(row.LABST ?? '').trim(),
        meins: String(row.MEINS ?? '').trim(),
      }))
    },
  }))
}
