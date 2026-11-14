# 部署与运行

## 已部署结构

新版本安装根目录 `/opt/dsh-v2`；DSH **0.2.2-rc.1**，Node.js **24.22.3**。`openaudit.service` 在 VPN 地址 `10.8.0.2:3090` 运行。代码在 `openaudit/`，状态和不可变原件在 `openaudit-data/`，新 DSH 配置在 `home/`，私密模型配置在 `secrets/`。

旧 `/opt/deepseek-harness`、`/root/.dsh`、`dsh.service` 不参与安装或数据迁移。

## 访问与登录

DSH 首次登录需要当前进程的启动链接。通过已授权的 SSH 私下获取；不要将输出保存到公共仓库或工单：

```sh
ssh -p 22022 root@103.149.91.227 \
  'python3 /opt/dsh-v2/openaudit/scripts/login-url.py'
```

VPN 浏览器打开该链接。无 VPN 时，在自己的电脑建立转发：

```sh
ssh -p 22022 -N -L 13090:10.8.0.2:3090 root@103.149.91.227
```

另一个终端获取对应链接：

```sh
ssh -p 22022 root@103.149.91.227 \
  'python3 /opt/dsh-v2/openaudit/scripts/login-url.py http://127.0.0.1:13090'
```

登录后点击“审计工作台”或访问 `/audit/`。首次 DSH 界面可能显示预览说明；确认后继续。Cookie 绑定访问地址，各地址需各自首次登录；重启后的新登录使用新启动链接。

## 公网 DNS 待使用者设置

在 Cloudflare 的 `myfangzhou.com` 区域添加：

| 类型 | 名称 | 目标 | 代理 |
|---|---|---|---|
| CNAME | audit-demo | 05aafb8d-a3f4-4d2d-b598-3968abf5fcc5.cfargotunnel.com | 开启 |

服务器 `/etc/cloudflared/config.yml` 已包含 `audit-demo.myfangzhou.com → http://10.8.0.2:3090`，由 `cloudflared-api.service` 读取；新增前保留带时间戳的备份，其余规则保留。DNS 生效后使用 `scripts/login-url.py https://audit-demo.myfangzhou.com` 获取公网登录链接。DNS 未生效期间不声称公网已验收。

## 可复现安装与更新

全新服务器先安装 Node.js 24 和系统 `poppler-utils`、`ffmpeg`。仅在隔离目录安装指定 DSH：

```sh
mkdir -p /opt/dsh-v2/app /opt/dsh-v2/home /opt/dsh-v2/workspace /opt/dsh-v2/secrets
npm install --prefix /opt/dsh-v2/app @deepseek-ai/dsh@0.2.2-rc.1
```

将本仓库构建后部署至 `/opt/dsh-v2/openaudit`。现有 Dell 可在开发机执行：

```sh
npm run build
scripts/stage-dell.sh root@103.149.91.227 22022
```

`stage-dell.sh` 只上传和安装解析依赖，不自动重启。`/usr/local/bin/dsh2` 应设置新 Node 的 PATH 和 `DSH_HOME=/opt/dsh-v2/home`，再执行新安装的 `app/node_modules/.bin/dsh`。不得指向旧 DSH。

依据 `deploy/models.example.json` 在服务器创建 `secrets/openaudit-models.json`，填写真实 API 密钥；文件权限 600，目录权限 700。`secrets/dsh.env` 中设置 `DEEPSEEK_API_KEY`，用于宿主自身的模型入口。密钥不写进源码或客户端。

```sh
cp /opt/dsh-v2/openaudit/deploy/openaudit.service /etc/systemd/system/openaudit.service
systemctl daemon-reload
systemctl enable --now openaudit
# 更新代码后的受控重启
systemctl restart openaudit
systemctl is-active openaudit
```

`cordis.patch.yml` 的新插件使用 `insert` 语法。`workspace-controller` 明确使用新目录，避免无桌面服务器的 XDG 工作区初始化失败。只启动一个写入同一 `openaudit-data` 的实例。

## 备份与恢复

在服务器运行 `scripts/backup-dell.sh`。它短暂停止本服务，保存新 DSH 的 home、secrets、业务数据及部署配置，并恢复原先运行状态。归档位于 `/opt/dsh-v2/backups`（目录 700、归档 600），包含秘密，禁止上传 GitHub。

恢复时先验证归档旁的 SHA-256 文件，再停止 `openaudit`；将当前数据另行备份，将可信归档解压至新的临时目录检查。用归档内的 `home`、`secrets`、`openaudit-data` 替换新版本对应目录（保留被替换版本以便回滚），恢复文件权限，部署匹配提交的代码和依赖后启动。检查资料数量、版本历史及原件下载；不得覆盖旧 DSH 目录。

## 运行限制与排查

模型配置及服务日志均留在服务器。不要公开完整服务日志，其中可能包含启动登录链接。登录失败先检查入口 Host 是否在服务 `--trusted-host` 列表内；模型失败检查对应供应商、网络及额度；PDF/视频失败检查系统解析工具。所有失败都应保留运行记录，不用预置成功结果替代。
