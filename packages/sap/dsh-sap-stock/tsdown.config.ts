import { clientBundle } from '../../client/tsdown.client.ts'

// 客户端伴生包构建:产出 lib/index.js(宿主半侧)+ lib/client.js(浏览器半侧)。
// 需要把本包放在 monorepo 的 packages/<group>/dsh-sap-stock/ 下,
// 让相对路径 ../../client/tsdown.client.ts 命中 packages/client/tsdown.client.ts。
export default clientBundle('dsh-sap-stock', ['src/index.ts'])
