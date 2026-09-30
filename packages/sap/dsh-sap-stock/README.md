# dsh-sap-stock

DSH 插件:把 SAP 库存查询能力接进 DSH,含登录(`ZDSH_LOGIN`)和库存查询(`ZDSH_GET_STOCK`)两个 RFC。

## 安全模型

- `get_stock` 工具 schema 只暴露 `werks` / `matnr`,**没有用户字段**。
- `I_USERID` 由服务端从登录会话注入,LLM 无法看到、改写、冒充。
- 数据权限由 `ZDSH_GET_STOCK` 内部针对 `I_USERID` 校验(SAP 侧负责)。
- 登录密码配置为 `role('secret')`,保存后不回显、不进入表单响应。

## 前置条件

1. 已有 **`sapconnect-dsh`** 插件(提供 Python 桥 `bridge.py`、SAP NW RFC SDK,凭据存 Windows 凭据管理器)。本插件复用它的桥调用 SAP,不直连。
2. SAP 侧已有 `ZDSH_LOGIN` / `ZDSH_GET_STOCK`(remote-enabled),服务账号有执行它们的 `S_RFC` 授权(**不要给数据角色**)。

## 安装

```sh
dsh plugin --profile <profile> add /path/to/dsh-sap-stock
```

或在 DSH 界面「设置 → 插件 → 添加本地插件」选择本目录。

## 配置

### 1. 登录账号密码(插件配置页,可编辑)

安装后,打开「设置 → 插件 → dsh-sap-stock → 配置」:

- `loginUser`:登录账号(如 `HECW`)。
- `loginPassword`:登录密码(如 `123456`),只写、保存后不回显。

保存即生效,下次查询库存会自动用它登录。

### 2. SAP 连接参数(静态,改 cordis.patch.yml)

`ashost` / `sysnr` / `client` / `user`(服务账号)/ `passwd` / `lang` 是静态配置,编辑插件的 `cordis.patch.yml`(或 profile 的 `cordis.patch.yml`)。

`passwd`(服务账号密码)建议留空,从环境变量 `SAP_DSH_PASSWD` 读取。

## 使用

1. 在插件配置页填好 `loginUser` / `loginPassword` 并保存。
2. 直接问 LLM「查工厂 2210 物料 X 的库存」。
3. `get_stock` 会自动用配置凭据登录(`ZDSH_LOGIN`),成功后按该用户查询库存(`ZDSH_GET_STOCK`);登录失败或无权限会报错并阻断。

### 斜杠命令(手动控制,可选)

- `/sap-login <userid> <password>` — 手动登录(两个参数都留空则用配置凭据)。
- `/sap-whoami` — 显示当前登录用户。
- `/sap-logout` — 退出登录。

## 说明

- 会话状态是**进程级单用户**,适合 DSH 桌面(每人一个实例)。共享服务多用户需按连接隔离。
- **两层凭据**:连接 SAP 的**服务账号**由 `sapconnect-dsh` 的桥从 Windows 凭据管理器读取(本插件不接触);**登录账号**(`loginUser`/`loginPassword`)用于身份验证与授权,在插件配置页填。
- 桥返回的 `LABST`(QUAN/Decimal)会转字符串,避免精度与序列化问题。
