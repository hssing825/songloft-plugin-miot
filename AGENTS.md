# AGENTS.md

本文件是 `songloft-org/songloft-plugin-miot` 的开发入口，记录智能音箱插件的实现约定、设备兼容与历史回归经验。英文版见 [AGENTS.en.md](AGENTS.en.md)。

## 仓库边界与入口

- 本仓库是独立 Git 仓库，在父仓库工作区位于 `plugins/src/songloft-plugin-miot/`；提交到本仓库的 `main`。
- 插件业务与排障经验维护在本文件；公共宿主、Go 后端和跨仓库通用约定见 [父仓库 AGENTS.md](https://github.com/songloft-org/songloft/blob/main/AGENTS.md)。
- `src/player/manager.ts` 管理播放状态、自动切歌与分组目标；`src/handlers/playlist.ts` 融合 HTTP/WS 状态；`src/playback/voice_resume.ts` 负责语音打断后的恢复；`src/mina/client.ts` 管理设备云端请求、共享采样与退避。
- `frontend/` 为 Vue + TypeScript 界面，构建到 `static/`；`plugin.json` 定义插件清单，最终产物为 `dist/miot.jsplugin.zip`，包含 QuickJS 字节码。
- 本文件与 `AGENTS.en.md` 内容、结构同步。提交使用 Conventional Commits，描述尽量用中文，不添加 `Co-Authored-By`。
- 提交信息引用本仓库 Issue 可以写 `#124`；引用父仓库 Issue 必须写完整路径，例如 `songloft-org/songloft#495`。子仓库先提交，父仓库再同步子模块指针；服务端和插件分别升级。

## 验证命令

在本仓库执行：

```bash
npx tsc --noEmit
node --experimental-strip-types --test tests/*.test.mjs
npm run build
npm run validate
```

Node 22 的类型擦除参数用于直接导入 TS 的测试。构建会先生成词典/节假日数据，再构建前端、打包并编译 QuickJS 字节码；`static/`、`dist/` 为忽略的构建产物。前端变更另在 `frontend/` 执行 `npm run typecheck && npm run build && npm test`。涉及宿主播放接口、Range 或定时器时，在父仓库执行相应 Go 回归测试和 `make check`。

## 公共宿主 API 使用经验

- 宿主 `internal/jsplugin/assets/common.js` 末尾公开对象决定 `window.SongloftPlugin` 实际可用的成员；使用 `@songloft/client-sdk` 的 `SongloftPluginGlobal`，不要手写宿主 API 类型。
- `invokeHost` 一度只存在于 `window.__SongloftInternal`（标注"插件请勿依赖"）而公开对象里没有，miot 却在自己的 `frontend/env.d.ts` 里手写了 `invokeHost?` 声明，于是 `window.SongloftPlugin?.invokeHost?.(...)` 通过 TS 编译、运行时被可选调用**静默吞掉**，收藏同步整个功能一个字节都没发出去（songloft-org/songloft-plugin-miot#86 第二次复发的根因）。
- 收藏同步通过公开 `invokeHost('favorite', 'refresh', {songId, isFavorited})` 调用宿主；原生 WebView 与 Web/iframe 的传输差异交给 SDK/宿主处理。

## 服务端播放接口的插件侧约定

- 音量均衡：设置页 `volume_normalize` → `URLBuilder.buildSongURL` 追加 `normalize=1&format=mp3`；预热下一首必须携带相同转码参数。
- 不入库直链遇到音箱不支持的 webm/opus 等格式，使用父仓库 `/api/v1/proxy/transcode` 转码代理（`songloft-org/songloft#394`）；token 放在首个查询参数，避免设备固件错误处理 `&`。
- 推 URL 后立即开始倒计时，会把冷启动下载/转码时间算成已听内容。插件 #61 曾出现 `dur_ms=22392/24348/22381` 的首字节等待：前 20 多秒空白，尾部也提前切掉。服务端使用实时流和预热，插件仍必须按真实设备进度校准，不能把缓存完成当成播放完成。
- 部分设备忽略暂停，需要升级为 stop；媒体上下文丢失后，通过带 `seek` 的新 URL 恢复位置（插件 #60）。`playCurrent` 的 seek 必须遵守服务端距结尾 3 秒的边界。
- 随机预热：随机模式下 `PlaylistManager.reserveNextIndex()` 把「预热的那首」和「真会播的那首」
  锁到同一首。`getNextIndex()` 每次调用都重新摇骰子，预热与切歌各调一次就必然热错人（实测 492/500 不一致）
- 流内位置：`PlaylistManager.streamSeekOffsetSec` 记住当前流的起点。带 seek 的流对设备是
  「从 0 开始的新流」，它上报的 `play_song_detail.position` 只是流内偏移，**消费点必须补上偏移**
  （`handlers/playlist.ts` 的 `resolvePlayerStatus`、`playback/voice_resume.ts` 的恢复判断），
  否则续播后网页进度条会掉回 0、自动切歌被推迟一整个 seek 时长

## 续播与重播的历史回归约束（songloft-org/songloft#516）

- **相同现象不等于相同根因**：排查先检索父仓库和插件仓库的全部 Issue，再对相关正文、评论、
  修复提交与现有测试交叉核对。至少覆盖父仓库（`songloft-org/songloft`）的 #171/#404/#408/#437/#449/#466/#481/#488/#490/#494/#495/#500/#503/#514/#516，
  以及本仓库 #54/#60/#61/#63/#87/#88/#95/#96/#98/#103/#114/#124。
  不因旧 Issue 已关闭就认为没有回归，也不要把未发布、未更新插件或旧 ffmpeg 镜像当成代码修复无效。
- **不能仅凭本地计时超前就重推**：缓冲会让音箱位置落后；状态 0/2 也可能误报（songloft-org/songloft#449）。
  自动恢复检测重播需同曲身份、连续新采样推进，以及至少一份采样落在流开头三秒且明显落后保存位置。
  判断前把流内秒换为 `position * speed + seekOffset`。身份未知、重复缓存或交互前采样不能证明重播。
- **保存位置不被暂停后的归零覆盖**：语音任务保存打断锚点，暂停/停止读回值不能把它回拨到 0。
  `resetAutoNextTimer` 是 HTTP/WS 状态融合与智能续播共用入口，必须挡住挂起期间的回零校准；
  只修 `VoiceResumeCoordinator` 会被状态轮询抢先改写位置、递增版本并取消任务（songloft-org/songloft#171）。
- **新操作优先，切歌规则不漂移**：每次 await 后核对任务身份和播放版本；暂停、停止、下一首、
  新对话及 DLNA 接管后，迟到结果不得恢复旧歌曲（songloft-org/songloft#408/songloft-org/songloft#494）。正常续播必须重建剩余时间定时器，
  保留 `transitionOffset` / speed（songloft-org/songloft#404、插件 #87/#88）；重播检测不能替代尾部结束校验（songloft-org/songloft#481/songloft-org/songloft#495）。
  自动恢复临近结尾时使用保护区前的安全整数秒，不能让 seek 守卫退化为整首重播。
- **取证与验证**：访问日志比较请求 `range`、响应 `content_range/content_length` 与实际 `bytes`；
  206 或重复 GET 本身不能证明全量重拉，下载字节也不是已听进度。ffmpeg 失败看完整 `error/output`；
  应用内升级不更新镜像里的 ffmpeg（songloft-org/songloft#403）。回归必须运行插件 `player_failures`、`player_status`、
  `player_transition`、`mina_status`、前端 slider/status 测试，及后端播放/Range/定时器测试。
  Node 22 用 `node --experimental-strip-types --test tests/*.test.mjs`，不能漏掉直接导入 TS 的测试。
  自动化通过只证明覆盖的场景；真实音箱、问题音频与长期运行验收须单独记录，不能宣称已完成。

## 切歌修复的证据与回归矩阵（songloft-org/songloft-plugin-miot#124）

- **无进度与查询失败分开处理**：成功返回明确状态、当前流从未上报有效进度且没有外来媒体证据的设备，
  到元数据截止时间按原时长切歌；`status=-1`、请求超时、进度冻结、流长不匹配继续有界重试。
  不能为修复 #124 删除 songloft-org/songloft#495 的 5 秒查询等待和 30 秒确认宽限期。`hasPosition=false` 的兜底 0
  不是真实回零，`hasPosition=true` 的有效 0 也不能被当作“设备不支持进度”。时长未知时不能凭空注册结束计时器。
- **进度来源必须贯穿调用链**：`resetAutoNextTimer(position, deviceReportsProgress)` 的第二个参数
  区分真实上报与保存锚点/墙钟外推；智能续播超时、挂起时 HTTP/WS 状态融合、插件重载、报时取消及仅流长探测
  都要核对来源。只改 `PlaylistManager` 不够，必须检查 `handlers/playlist.ts` 和 `playback/voice_resume.ts`。
  智能续播曾收到真实进度、随后查询失败时，仍须保留这份证据，不能因最后一份采样缺失而走无进度兜底。
- **证据按当前流保存**：软暂停、语音挂起、续播及计时器重排保留“曾收到有效进度”；新歌、同曲重推 URL、
  新歌单和销毁清空。迟到查询须在播放身份/版本检查之后才记录，不能污染替换流并给它额外加 30 秒等待。
- **先复现交叉场景，再修复**：新增测试应在修复前失败、修复后通过；同时断言下一首 URL 是否实际下发、
  队列索引/状态、失败标记、TTS 及剩余定时器。纯 `onSongFinished` 计数或 UI 截图不能证明整个队列能继续。
  全量筛查两仓库的 Issue 和评论后，对相关修复提交、最新复发日志逐项核对；未证实根因的旧报告保留为未知，
  不因标题相似就归并、不因已关闭就跳过。

| 历史问题 | 必须保留的行为 | 回归入口 |
|---|---|---|
| 父 #495 ↔ 插件 #124 | 无进度设备按时切歌；真实进度丢失、缓冲、冻结和流长不匹配保留确认保护 | `player_transition`、`player_failures` |
| 父 #404、插件 #60/#87/#88/#95 | 长暂停后按剩余时间续播，seek/倍速/切歌偏移不丢失，真实归零不覆盖打断锚点 | `player_failures`、`player_status` |
| 父 #264/#437 | 时长未知不放弃队列探测，也不凭空设置结束上限；读到设备流长后接回正常计时器 | `player_transition`、后端 seek 测试 |
| 插件 #98 | 云端回执超时不等于设备未起播，保留假失败核验、退避重试与外部恢复兜底 | `player_failures`、`mina_status` |
| 父 #466/#494、插件 #114 | 失败标记有 TTL；全部候选失败仍有重试；自然结束不误标、不发打断下一首的单首 TTS | `player_failures`、前端失败标记测试 |
| 父 #408/#449、插件 #103 | 外部停止与状态误报按进度证据区分；新操作/DLNA 接管后旧任务不得推歌 | `player_failures`、`player_status` |
| 父 #500/#503/#514 | 同设备共享查询、失败退避、控制优先；过期句柄和迟到结果不清理新定时器 | `mina_status`、`player_transition`、宿主 timer 测试 |

矩阵修改须与英文版同步。列出的测试文件使用 `tests/<name>.test.mjs`；父仓库与插件独立升级，验收要记录两者版本和实际包含的提交。
