# MIoT 插件开发经验

## 范围与来源

记录songloft-org/songloft-plugin-miot 的设备状态、播放、切歌、语音/整点恢复与前端行为。流程见 [本地 AI 开发流程](docs/ai-development.md)，公共宿主约束见父仓库。已有 AGENTS 和业务文档仍是权威规则，LESSONS 链接证据而不复制历史全文。

## 记录与升级

每条含规则、适用范围、完整 owner/repo#编号、失败/修复 commit SHA、实际验证和 Done right 示例；没有正确示例时写待补。Seen 只统计不同日期的独立事件，同一事故重复复盘不增加。三个日期后提出升级并标记规范位置，已有铁律/严重问题立即处理。与 [英文版](LESSONS.en.md) 同步，不虚构历史次数、修复结论或设备验收，敏感信息脱敏。

## 条目

### MIOT-001：尾部缺失进度时，区分成功的停止采样与查询失败

- 范围：自动切歌，流长与歌曲元数据不一致的设备。
- 失败：[songloft-org/songloft#495 最新反馈](https://github.com/songloft-org/songloft/issues/495#issuecomment-6144580047)，2026-10-13。此前修复 [4aeadc5](https://github.com/songloft-org/songloft-plugin-miot/commit/4aeadc559a04c5ddf329277425e4df3660d17f8a) 保留连续推进保护，但设备自然结束后删除 `play_song_detail`，成功返回的 idle 被当作单纯缺失进度。日志在 19:28:01–19:28:25 连续返回 `status=0, hasPosition=false, duration=0`，直到宽限期到点才切歌，造成静音等待。
- 修复：基线 `587b77f000d7af4b022229b293bc519b3a957851` 的未提交工作树；`observeDeadlineTail` 仅在已确认当前流持续推进至元数据尾部后，接受两份新鲜 idle 且无进度/流长的成功采样为结束证据。缺失进度的兜底零仍不作为真实回零，查询失败、外来流长及 playing 下缓冲保留有界宽限。
- Done right：`player_transition` 覆盖 idle 0/2/3、seek/倍速、单次误报、重复缓存、查询失败、重新推进及外来流长；`player_failures` 使用日志中的 593/651 秒时长并断言实际下一首 URL、连续两集自然结束、失败标记、TTS 与后续定时器。隔离旧实现的 16 个新增结束场景全部因未及时切歌而失败，修复后全量 840 项测试通过。真实音箱试听未运行，模拟时钟不能证明无缝发声。
- 时长边界：该日志中元数据 651 秒、设备流长 723.289 秒，位置仍推进到 732 秒；两种时长都不能单独证明音频结束，也不能据此把设备流长写回歌曲元数据。实际音源差异仍需真机/原音频核实。
- Seen 1× (2026-10-13)。状态：经验；既有回归要求见 [AGENTS.md](AGENTS.md) 的切歌修复矩阵。
