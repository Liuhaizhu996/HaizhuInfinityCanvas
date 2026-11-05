import { defineNode, type NodeDefinition } from "./define-node";

/** First-party adapter manifests. Descriptions only — no network clients. */
export const stubCatalog: readonly NodeDefinition[] = [
  defineNode({
    type: "openai.chat",
    title: "对话 LLM",
    category: "llm",
    summary: "OpenAI 兼容 Chat Completions。脚手架不会发起请求。",
    ports: [
      { id: "prompt", name: "prompt", direction: "input", dataType: "text" },
      { id: "text", name: "text", direction: "output", dataType: "text" },
    ],
  }),
  defineNode({
    type: "openai.image",
    title: "图像",
    category: "image",
    summary: "OpenAI 兼容 Images API。脚手架不会发起请求。",
    ports: [
      { id: "prompt", name: "prompt", direction: "input", dataType: "text" },
      { id: "image", name: "image", direction: "output", dataType: "image" },
    ],
  }),
  defineNode({
    type: "comfyui.image",
    title: "ComfyUI",
    category: "image",
    summary: "外部 ComfyUI HTTP API（/prompt）。不内置 GPL 源码。",
    ports: [
      { id: "prompt", name: "prompt", direction: "input", dataType: "text" },
      { id: "image", name: "image", direction: "output", dataType: "image" },
    ],
  }),
  defineNode({
    type: "video.wan-kling",
    title: "视频 Wan / Kling",
    category: "video",
    summary: "Wan 或 Kling 的异步视频任务。脚手架不会提交任务。",
    ports: [
      { id: "prompt", name: "prompt", direction: "input", dataType: "text" },
      { id: "image", name: "image", direction: "input", dataType: "image" },
      { id: "video", name: "video", direction: "output", dataType: "video" },
    ],
  }),
  defineNode({
    type: "tts.edge",
    title: "Edge-TTS",
    category: "audio",
    summary: "微软 Edge 在线语音。不链接 LGPL 的 edge-tts 包。",
    ports: [
      { id: "text", name: "text", direction: "input", dataType: "text" },
      { id: "audio", name: "audio", direction: "output", dataType: "audio" },
    ],
  }),
  defineNode({
    type: "tts.cosyvoice",
    title: "CosyVoice",
    category: "audio",
    summary: "本地 CosyVoice HTTP 服务（Apache-2.0）。脚手架不会连接。",
    ports: [
      { id: "text", name: "text", direction: "input", dataType: "text" },
      { id: "audio", name: "audio", direction: "output", dataType: "audio" },
    ],
  }),
  defineNode({
    type: "storyboard.board",
    title: "分镜",
    category: "storyboard",
    summary: "分镜板占位。把文本收成 storyboard 端口。脚手架不会生成镜头。",
    ports: [
      { id: "prompt", name: "prompt", direction: "input", dataType: "text" },
      { id: "board", name: "board", direction: "output", dataType: "storyboard" },
    ],
  }),
];
