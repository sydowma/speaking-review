# Speaking Review - AI 英语口语复盘工具

[English](README.md) | [简体中文](README.zh-CN.md)

![Speaking Review AI 英语口语反馈面板](docs/images/speaking-review-hero.png)

Speaking Review 是一个本地优先、可自托管的 AI 英语口语复盘工具，适合复盘雅思口语练习、Cambly 课程、英语模拟面试和日常口语录音。它使用 whisper.cpp 在本地完成语音转文字，通过 Claude 或 Codex CLI 分析口语问题，并提供带音频波形、同步文本、纠错建议、浏览器原生 TTS 和卡片练习模式的交互式 Web 界面。

这个项目适合希望保护原始录音和转写数据，同时又想系统提升英语表达、流利度和面试口语表现的学习者。

## 功能特性

- **AI 口语反馈**：分析语法、词汇、流利度、连贯性、填充词和具体表达问题。
- **本地语音转文字**：通过 whisper.cpp 将练习录音转成带时间戳的 transcript。
- **交互式复盘界面**：支持音频波形、同步文本、问题定位和纠错卡片。
- **专项练习模式**：使用浏览器原生 TTS 播放修正句，并记录复习进度。
- **实验性 Cambly 导入**：复用已登录的 Chrome 会话，按从新到旧抓取可下载的 Cambly 课程视频，并接入同一套分析流程。
- **本地优先存储**：默认将 review 数据保存在 `~/.speaking-review/reviews/<uuid>/`。
- **可自托管访问**：可以部署 Bun server，在手机、平板或其他设备上查看复盘结果。

## 适用场景

- 雅思口语练习复盘
- 英语模拟面试反馈
- Cambly 或在线外教课程复盘
- 英语口语流利度分析
- 本地 AI 语言学习工作流
- 自托管语音复盘看板

## 项目结构

- **`shared/`**：CLI、Server 和 Web 共用的 TypeScript 类型。
- **`cli/`**：Bun CLI，负责 ffmpeg 音频提取、whisper.cpp 转写和 Claude 分析。
- **`server/`**：Bun HTTP API 和静态文件服务，可本地运行，也可部署到 VPS。
- **`web/`**：Vite + React 前端，包含波形、转写文本、问题反馈和练习模式。

## 技术栈

- Bun + TypeScript monorepo
- whisper.cpp 本地语音识别
- Anthropic Claude 口语分析
- React + Vite Web 应用
- Bun HTTP server
- ffmpeg 音频提取

## 前置依赖

```bash
bash scripts/sr setup --with-model
export SPEAKING_REVIEW_ANALYZER=codex
# 或者：export ANTHROPIC_API_KEY="your-anthropic-api-key"
```

`setup --with-model` 会安装本地工具链、执行 `bun install`、安装 Playwright Chromium，并下载默认 whisper.cpp 模型。正式处理录音前，可以先运行 `bash scripts/sr doctor` 检查环境。

## 本地使用

```bash
bash scripts/sr review /path/to/recording.mp4
bash scripts/sr ui
# 打开 http://localhost:5173
```

review 数据默认保存在 `~/.speaking-review/reviews/<uuid>/`。如果设置了 `$SPEAKING_REVIEW_DATA`，则使用该目录。

常用快捷命令：

```bash
bash scripts/sr list
bash scripts/sr sync <review-id> --to https://your-server.example
bun run doctor
bun run review /path/to/recording.mp4
bun run ui
```

## Cambly 导入

Speaking Review 可以通过浏览器辅助流程导入你自己的 Cambly 课程历史。OpenCLI Browser Bridge 模式会复用你已经登录的 Chrome 会话，从 Cambly past-lessons 页面读取最新课程记录，把官方 lesson transcript 保存到仓库外部，并在没有 Anthropic key 时默认用 Codex CLI 生成复盘报告。

```bash
opencli doctor
export SPEAKING_REVIEW_ANALYZER=codex
bash scripts/sr cambly-loop --once --date 2026-06-27
bash scripts/sr cambly-loop --interval 15m
```

`cambly-loop` 默认开启分析，默认只检查当天课程；可以用 `--date`、`--since` 或 `--all-history` 改变时间窗口。当 Cambly 先暴露 transcript、还没有可下载视频时，会生成 transcript-only review。`cambly-fetch` 仍保留用于旧的可下载 chat video。签名视频 URL 只在内存中使用；本项目不会保存 Cambly 密码或 token。安装、CDP 备用方案和排障说明见 [`docs/cambly-import.md`](docs/cambly-import.md)。

## 跨设备部署

如果希望在手机、平板或其他电脑上查看复盘结果，可以参考 [`deploy/README.md`](deploy/README.md)，使用 Docker 或 systemd 部署到 VPS，并通过 Caddy 做 HTTPS 反向代理。

本地完成 ingest 后，可以用 `speaking-review sync` 将 review 上传到远端 server。

## 隐私说明

- 原始录音、转写文本和分析结果默认存放在仓库外部。
- 远端 server 只有在配置了 `SPEAKING_REVIEW_TOKEN` 后才会启用访问保护。
- 不要提交生成的 review 数据、音频文件、transcript 或本地环境变量文件。

## License

Apache-2.0。详见 [`LICENSE`](LICENSE)。
