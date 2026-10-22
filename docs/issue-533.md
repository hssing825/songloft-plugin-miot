# #533：语音定时停止后的续播与重复确认

对应 [songloft-org/songloft#533](https://github.com/songloft-org/songloft/issues/533)。[English](en/issue-533.md)。

## 日志与根因

报告版本为 Songloft 2.13.0 / MIoT 10.16.1；附件中的设备为 L15A。`songloft-logs-20261022-083024.zip` 在 07:53:57 和 08:28:49 均记录了「半小时后停止播放」匹配 `sleep_timer`、成功设置 30 分钟定时器及下发确认 TTS。随后分别在 07:54:15 和 08:29:31 确认外部停止，未见该命令的语音恢复任务。日志没有显示这两次是定时器提前到期。

规则与 AI 的设置、查询、取消定时分支都会播报，但原来的 `tryResumePlayback` 只处理音量、播放模式与收藏。因此语音唤醒打断 URL 播放后，这三类命令没有保护打断位置或启动续播；状态检测最终把设备空闲判为外部停止。

08:28:43.755 的云端对话到 08:28:49.103 才进入监听器，约相差 5.35 秒；插件在 08:28:49.130 下发 TTS，08:28:49.617 收到成功回执。云端回答已经是「好的，30分钟后我会停止播放」，插件仍重复确认。这些时间不能证明实际两次发声相隔多久。

## 修复行为

- 规则与 AI 的设置、查询、取消定时命令在播报前挂起切歌检测并保存位置，完成后交给既有 `VoiceResumeCoordinator` 确认进度或重推同曲。
- `finally` 保证确认 TTS 失败后仍可尝试恢复；播放版本变化、定时到期、新对话或暂停/切歌使旧任务失效。原本暂停的设备不会被启动。
- 对时间定时，仅当本条云端回答明确确认相同分钟数时省去重复 TTS。空回答、失败、不明回答、不同参数或未支持的复合时长继续由插件确认。按曲目定时仍保留插件播报。
- 使用已有恢复协调器，保留 seek、倍速、真实进度确认、缓存/失败退避和自然下一首规则；没有调整对话轮询频率或宿主 API。

## 验证对象与结果

- 时间 / 环境：2026-10-22，Linux amd64，Node 22.17.1，Go 1.26.0，本地未提交工作树；云端、音箱状态及时间由受控夹具提供。
- 插件基线：`b49a4a6a6902ed1778a4660782431bc2ab545381`。只读比较远端 `22cc42dcbd992782ab0e64becdb49a5eb6a0f886`，差异仅为 2026.10.21.0 版本元数据。
- 父仓库：`11e772580d83608b5a1ea3ca7597eb0c1da8b1fe`，本次未改 Go 或已记录的 gitlink；插件为 dirty。
- 验证代码标识：`git diff -- src/music/service.ts tests/player_failures.test.mjs` 的 SHA-256 为 `e88f62257c3bff22bb880761c84b7ba0aa5201aaef15c53ccabfc395d0ea8b66`。该标识只覆盖源码与测试，不含本说明和经验文档。

| 检查 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | 通过 |
| `node --experimental-strip-types --test tests/*.test.mjs` | 1256 项通过 |
| `node --experimental-strip-types --test-name-pattern='issue 533' tests/player_failures.test.mjs` | 55 项通过；包含有/无状态页、seek/倍速、实际恢复 URL、自然下一首、按时间/曲目到期、新操作取消及 TTS 失败 |
| 隔离目录装回基线 `src/music/service.ts`，运行相同 55 项 | 46 项按目标行为失败，9 项通过；未覆盖工作树源码 |
| `npm run build` / `npm run validate` | 通过，明确生成 `main.jsc` |
| 前端 `node --test tests/slider_drag.test.mjs tests/status_recovery.test.mjs tests/playback_failures.test.mjs` | 16 项通过 |
| 父仓库 `CGO_ENABLED=0 make check` | 通过，含格式、vet、全量 Go 测试 |
| 父仓库 `CGO_ENABLED=0 go test -tags dev,lite ./internal/jsruntime ./internal/jsplugin ./internal/services ./internal/handlers -run 'Timer\|Play\|Seek\|Stream\|Range'` | 通过 |
| TypeScript 格式化与 `git diff --check` | 通过 |

沙箱内首次 Go 检查因构建缓存只读失败；获准在沙箱外重跑通过。沙箱内首次打包跳过了 `jsc`，沙箱外重跑明确完成字节码编译，以后者为最终包。Node 测试也以沙箱外取得的逐用例结果为准。

日志位于 `/tmp/songloft-533-{suite,after,isolated-before,integrated,integrated-before,build,validate,frontend-playback,backend-check,backend-targeted}.log`。本地 `dist/miot.jsplugin.zip` 的文件 SHA-256 为 `b7dc3bec3b0633ed4c91b44d801f775e12a7c948ba8b7d832bc3c2f67945ef4b`，仍带基线版本元数据，不能当作公开新版本。

## 历史修复复核（2026-10-22）

语音与整点续播曾多次返工；[#481 最后一次真机反馈](https://github.com/songloft-org/songloft/issues/481#issuecomment-6207075183)确认当时约六秒恢复。核对对应的 `1fdcecdb63a5c521347dd97e7fd82f524d78142a`，`src/music/service.ts:1040` 的恢复名单仍只有音量、播放模式与收藏，未接入定时口令。因此不能把 #481 的真机验收外推为 #533 已通过。

本轮只加强测试，生产源码未再调整。新增 24 组“真实 ConversationMonitor → VoiceDispatcher → guarded 音乐引擎 → VoiceResumeCoordinator → MinaService/MinaHTTPClient”的集成回归；只在云端 I/O 边界提供夹具。覆盖 Music API/直链、有/无状态页、0.5/1/2 倍速和 idle 0/3，包含对话空闲退避、共享状态缓存、半秒云端响应及八秒播报。每组断言播报结束前不推歌、实际下发保存位置的同曲 URL、不重复确认，以及之后两次自然切歌均下发正确 URL、无失败标记且定时器仍有效。24 组在修复下通过，隔离旧源码下全部因没有恢复歌曲 URL 而失败。完整专项共 55 项、全量共 1256 项通过。

这增加了对入口遗漏和调用链兼容性的证据，仍不能替代真机发声或固件原生定时共存的验收。

## 交付边界

提交前复验：先快进至远端 `22cc42dcbd992782ab0e64becdb49a5eb6a0f886`，源码/测试差异标识不变；重新通过类型检查、1256 项插件测试、68 项完整前端测试及前端类型检查、QuickJS 构建与包校验。日志 `/tmp/songloft-533-final-{suite,frontend,build,validate}.log`；该次本地包仍标记 2026.10.21.0，文件 SHA-256 为 `fffc5bafc0b08aff03f1edc2ec9b3cfb364de3d2e0809530cfbe35713cf68ec2`。正式自动发布包按其 `releaseSource`、版本及下载文件另行验收。

Not run：L15A 真机发声、固件原生定时与插件定时共存、真实云端对话延迟、长期运行、远端 CI 及正式发布。本次没有前端交互变更，未执行浏览器操作。自动化不能证明实际静默秒数，仍需在报告人的设备上复测。

以上为本地验证阶段记录，未安装到真实音箱。后续提交、CI、自动发布与回复状态以 #533 的交付评论为准；真机验收前保留 Issue 打开。提交信息：`fix(voice): 修复语音定时后的续播并避免重复确认`，正文引用 `songloft-org/songloft#533`。
