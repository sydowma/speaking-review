# Speaking Review - AI 英语口语复盘工具

[English](README.md) | [简体中文](README.zh-CN.md)

![Speaking Review AI 英语口语反馈面板](docs/images/speaking-review-hero.png)

Speaking Review 是一个本地优先、可自托管的 AI 英语口语复盘工具，适合复盘雅思口语练习、Cambly 课程、英语模拟面试和日常口语录音。它使用 whisper.cpp 在本地完成语音转文字，通过 Claude 分析口语问题，并提供带音频波形、同步文本、纠错建议、浏览器原生 TTS 和卡片练习模式的交互式 Web 界面。

这个项目适合希望保护原始录音和转写数据，同时又想系统提升英语表达、流利度和面试口语表现的学习者。

## 功能特性

- **AI 口语反馈**：分析语法、词汇、流利度、连贯性、填充词和具体表达问题。
- **本地语音转文字**：通过 whisper.cpp 将练习录音转成带时间戳的 transcript。
- **交互式复盘界面**：支持音频波形、同步文本、问题定位和纠错卡片。
- **专项练习模式**：使用浏览器原生 TTS 播放修正句，并记录复习进度。
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
brew install ffmpeg whisper-cpp bun
# whisper 模型，首次下载约 3GB
mkdir -p ~/whisper-models
curl -L -o ~/whisper-models/ggml-large-v3.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin
export ANTHROPIC_API_KEY="your-anthropic-api-key"
```

## 本地使用

```bash
bun install
bun run ingest /path/to/recording.mp4   # 约 3 分钟：ffmpeg + whisper + Claude
bun run dev                              # 同时启动 server 和 web
# 打开 http://localhost:5173
```

review 数据默认保存在 `~/.speaking-review/reviews/<uuid>/`。如果设置了 `$SPEAKING_REVIEW_DATA`，则使用该目录。

## 跨设备部署

如果希望在手机、平板或其他电脑上查看复盘结果，可以参考 [`deploy/README.md`](deploy/README.md)，使用 Docker 或 systemd 部署到 VPS，并通过 Caddy 做 HTTPS 反向代理。

本地完成 ingest 后，可以用 `speaking-review sync` 将 review 上传到远端 server。

## 隐私说明

- 原始录音、转写文本和分析结果默认存放在仓库外部。
- 远端 server 只有在配置了 `SPEAKING_REVIEW_TOKEN` 后才会启用访问保护。
- 不要提交生成的 review 数据、音频文件、transcript 或本地环境变量文件。

## License

Apache-2.0。详见 [`LICENSE`](LICENSE)。
