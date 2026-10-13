# MIoT 插件 AI 开发流程

## 执行与授权

任务交办后连续调查、实现、验证、自审、交付，不逐阶段确认。先检查工作树，读本地 AGENTS、适用 LESSONS 和业务文档，保留用户改动。关键缺失信息、产品决定或扩大范围时才询问；已有授权不重复询问。提交、推送、正式发布和 Issue 写操作分别需要明确授权，直接提交 main，子仓库先提交、父仓库后更新指针。

公共机制见 [父仓库 AI 流程](https://github.com/songloft-org/songloft/blob/main/docs/ai-development.md)。本文件与英文版同步；本仓库的业务、设备和验证要求优先。

## 关联 Issue 回复

修复推送后主动展示完整回复草稿、完整目标 `owner/repo#编号` 与待确认的评论动作，包括关联父仓库 Issue。没有适用评论授权时等待用户确认，已有授权直接回复，不重复询问；确认仅对应已展示的具体动作，提交/推送/发布授权不自动包含评论或关闭。其他已授权工作继续。发表前复核最新评论，发表后回读正文并交付链接；完整规则见 [父仓库关联 Issue 回复](https://github.com/songloft-org/songloft/blob/main/docs/ai-development.md#关联-issue-回复)。

插件回复分清修复提交已推送、具体发布版本已包含修复和真机已验收；草稿随 CI、发布结果更新，说明测试、Not run、剩余问题及用户下一步。未试听时保留验收边界，不等用户追问才准备回复，也不擅自关闭 Issue。

## 验证与证据

源码改动执行 `npx tsc --noEmit`、`node --experimental-strip-types --test tests/*.test.mjs`、`npm run build`、`npm run validate`。前端另跑 `npm run typecheck && npm run build && npm test`；宿主接口变更需父仓库相应 Go 回归。设备行为按 AGENTS 的回归矩阵，覆盖有/无进度、Music API/直链、语音/整点、seek/倍速及自然下一首；断言实际 URL、进度来源、失败标记、TTS 和定时器，不能只数回调或看 UI。纯文档无需机械构建。

每次记录仓库、完整 Issue 引用、基线/最终 SHA 或未提交差异标识、环境、时间、命令、实际结果、日志/截图和相关 Not run。Bug 新测试在隔离旧实现下应因目标行为失败；必要时做破坏检查。代码/依赖/生成物改变后重跑受影响项，推送后追踪同一 SHA 的必要 CI，取消/跳过不算通过。

插件与后端独立升级；记录设备型号/固件、音频来源、插件/后端版本和已安装提交。云端回执不等于设备发声，模拟进度不等于真实采样。真实音箱或问题音频未验时写 Not run，保留历史回归矩阵。

## Issue 排查

排查未解决 Issue 包含父仓库与所有递归子模块，按仓库去重、完整分页、保留负责人，不只检查本仓库。在父工作区运行 `node scripts/ai-review-context.mjs issues --output /tmp/songloft-issues-<唯一标识>.json`；单独 checkout 时读取父 .gitmodules 清单并用 GitHub 只读 API 补齐范围。

读取正文、全部评论、关联修复/复发证据并核对远端默认分支 SHA。报告未修复/部分修复/已修复但未关闭/等待信息/未验证、下一步与缺口。子仓库修复、父指针同步、发布及安装分别判断；open 不证明未修复，访问失败不算零 Issue。统一 `owner/repo#编号`，父仓库引用为 `songloft-org/songloft#编号`。

## 经验复盘

任务结束把有证据的教训写入本仓库 LESSONS 中英版本；时间窗口复盘在父仓库用 ai-review-context.mjs commits 收集所有本地历史，明确远端新鲜度与覆盖缺口。只核对返工、不应合入的改动、验证遗漏；无证据推断列为待核实。

每条记录范围、规则、失败/修复提交、正确示例及 Seen 日期；同一事件重复复盘不递增，三个不同日期的独立事件提出规范升级，标记权威规则位置并按需加测试闸门。已有铁律立即执行，严重问题不等待三次；经验不扩权、不推翻产品决定。
