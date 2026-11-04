# 服务器部署示例

以下使用示例域名 `sports.example.com` 与通用目录，请按自己的服务器配置调整。仓库不包含实际服务器地址、SSH 凭证或生产环境文件。

- 公开活动：https://sports.example.com/sports/
- 分赛道榜单：https://sports.example.com/sports/#leaderboard
- 管理页：https://sports.example.com/sports/#admin
- 实时投屏：https://sports.example.com/sports/#screen
- 当前验证模式：`ACTIVITY_TIME_LIMITS=false`，随时可报名与打卡，不自动结榜。手动暂停、结榜仍有效。恢复正式时间限制时将该变量改为 `true` 并重启服务，赛程为 2026-11-01 08:00–18:00（北京时间）。

子路径部署应保留现有网站配置。使用独立持久化目录，关闭演示数据，不与其他应用混用数据库。

## 首次部署

1. 安装 Node.js 24，创建专用系统用户 `sports-pk`，将源码放到 `/opt/move-together/app`。
2. 从 `.env.example` 创建 `/opt/move-together/production.env`，权限设为 600，并配置 `DATA_DIR=/var/lib/move-together`、`SEED_DEMO=false`、`PORT=3011`、`HOST=127.0.0.1`、`COOKIE_SECURE=true`、`BASE_PATH=/sports/`、`COOKIE_PATH=/sports/`；管理口令与模型密钥只写在此文件中。
3. 创建并授权数据目录给 `sports-pk`；在应用目录执行 `npm ci`、`npm test`、`BASE_PATH=/sports/ npm run build`。
4. 按实际 Node 安装位置修改 `move-together.service` 的 `ExecStart`，安装服务并启用。systemd 读取权限为 600 的环境文件并向服务进程传入配置。
5. 配置 DNS 和 HTTPS，在对应域名的 nginx HTTPS server 中引入 `nginx-sports.conf`，执行 `nginx -t` 后重载。
6. 验证报名、打卡、榜单、管理员和图片权限。首次正式活动使用全新数据目录；后续更新保留已有数据。

## 服务与文件

服务为 `move-together.service`，以专用系统用户 `sports-pk` 运行，开机启动、异常重启。监听 `127.0.0.1:3011`，nginx 将 `/sports/` 转发至该端口并去掉路径前缀。

| 内容 | 服务器路径 |
| --- | --- |
| 应用与构建产物 | `/opt/move-together/app` |
| Node.js 运行时（建议 Node 24） | `/opt/move-together/runtime/node` |
| 环境配置，root 读写 | `/opt/move-together/production.env` |
| SQLite 数据目录，sports-pk 读写 | `/var/lib/move-together` |
| 私有截图与水印照片，sports-pk 读写 | `/var/lib/move-together/evidence` |
| nginx 活动配置 | `/etc/nginx/snippets/move-together.conf` |
| 原站 nginx 配置备份 | `/opt/move-together/sports.example.com.conf.before-sports` |

环境配置包含 API 密钥与管理口令，勿打印到日志或复制进公开文件。管理口令由环境变量 `ADMIN_KEY` 配置，或由应用生成到数据目录的 `admin-key.txt`；只在受信任的服务器上读取。API 仅从服务器调用 DeepSeek 官方地址。

```sh
systemctl status move-together.service
journalctl -u move-together.service -n 50 --no-pager
systemctl restart move-together.service
curl --fail http://127.0.0.1:3011/api/state
```

## 活动操作

首次访问只填写昵称。未报名项目先选个人参赛、加入或创建本项目战队，已报名项目卡片直达录入。每个项目可加入不同战队，每队固定项目、最多 5 人；加入自动报名并沿用已有成绩。组队广场、“我的”和邀请确认均按项目展示；每个赛道独立展示个人和团队人均榜。减重、增重均按早晚体重差绝对值计算，原始体重不公开。截图先保存再识别，结果只回填，参与者核对后提交。喝水改为拍照加昵称及时间水印，每次确认 +1 杯，不调用识别模型；原有杯数保留，同次提交重试不重复计数。

图片仅本人和管理员可查看与下载：本人在“我的 → 我的打卡凭证”，管理员在参与者记录的“核对凭证”列。存储目录不经 nginx 静态公开，读取需经过 API 身份校验。

管理员输入口令进入管理页，可生成中途战报、暂停/恢复、导出 CSV、提前最终结榜。中途战报是当时数据的固定快照；投屏可切换项目、个人/团队榜、轮播与全屏。最终结榜不可撤回。

## 更新与备份

本地先执行 `npm test` 和 `BASE_PATH=/sports/ npm run build`，上传 `dist/`、`server/` 和 package 文件。不要上传 `.env`、本机 `data/`、`node_modules/` 或 SSH 私钥。应用依赖在服务器执行 `npm ci --omit=dev`。更新时保留 `/var/lib/move-together` 与 `production.env`。

备份必须包含数据库和图片目录。建议停活动服务后备份整个数据目录；如需在线备份，先执行 SQLite 在线备份，再复制只追加的图片目录（此顺序确保数据库引用的图片包含在备份中）。不能只复制正在写入的主数据库文件：

```sh
install -d -m 700 /opt/move-together/backups
python3 - <<'PY'
import sqlite3, datetime, pathlib, shutil, os
stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
backup = pathlib.Path('/opt/move-together/backups') / ('data-' + stamp)
backup.mkdir(mode=0o700)
with sqlite3.connect('/var/lib/move-together/activity.sqlite') as source:
    with sqlite3.connect(backup / 'activity.sqlite') as target:
        source.backup(target)
os.chmod(backup / 'activity.sqlite', 0o600)
photos = pathlib.Path('/var/lib/move-together/evidence')
if photos.exists():
    shutil.copytree(photos, backup / 'evidence')
PY
```

仅撤下活动时，先从域名 HTTPS server 中移除 `include /etc/nginx/snippets/move-together.conf;`，执行 `nginx -t` 和 `systemctl reload nginx`，再停止活动服务；保留数据以便导出。

2026-11-01 榜单更新：各赛道支持综合 / 个人 / 团队榜，综合榜比较个人成绩与团队人均成绩；旧战报从快照推导综合榜，不引用实时数据。公开图片标记不暴露凭证 ID 和文件；图片仍需本人或管理员权限。首页冗余内容及特殊装饰星号已移除。

2026-11-01 项目战队迁移：启动时按活动日期一次性生成 `project_teams_v4` 和 `team_members_v4`，仅纳入旧队中该项目已报名成员，旧表与快照不修改。升级前备份应用、SQLite 和 evidence，并在副本核对各项目成员数、人均成绩一致。回滚前须检查是否已有新版本写入；有新成员时不能直接切回只识别全局战队的旧程序。
