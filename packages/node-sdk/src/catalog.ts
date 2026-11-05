import { defineNode, type NodeDefinition } from "./define-node";

/**
 * First-party manifests. `openai.chat` and `openai.image` are executable.
 * The other entries stay in the library so a graph can be saved, but the
 * sidecar refuses to call them.
 */
export const nodeCatalog: readonly NodeDefinition[] = [
  defineNode({
    type: "openai.chat",
    title: "对话 LLM",
    category: "llm",
    summary: "OpenAI 兼容 Chat Completions。本地引擎发起一次阻塞请求，密钥留在 sidecar。",
    executable: true,
    ports: [
      { id: "prompt", name: "prompt", direction: "input", dataType: "text" },
      { id: "text", name: "text", direction: "output", dataType: "text" },
    ],
    fields: [
      {
        key: "prompt",
        label: "提示词",
        kind: "textarea",
        placeholder: "写给模型的内容。连上上游文本时，以上游为准。",
      },
      { key: "system", label: "系统提示", kind: "textarea", placeholder: "可选" },
      { key: "model", label: "模型", kind: "text", default: "gpt-4o-mini" },
      { key: "temperature", label: "温度", kind: "number", help: "0 到 2。留空则不传。" },
      { key: "seed", label: "Seed", kind: "number", help: "整数。留空则不传。" },
    ],
  }),
  defineNode({
    type: "openai.image",
    title: "图像",
    category: "image",
    summary: "OpenAI 兼容 Images API。与对话共用 Base URL 和密钥。",
    executable: true,
    ports: [
      { id: "prompt", name: "prompt", direction: "input", dataType: "text" },
      { id: "image", name: "image", direction: "output", dataType: "image" },
    ],
    fields: [
      {
        key: "prompt",
        label: "提示词",
        kind: "textarea",
        placeholder: "连上对话节点时，使用对话的输出。",
      },
      { key: "model", label: "模型", kind: "text", default: "dall-e-3" },
      {
        key: "size",
        label: "尺寸",
        kind: "text",
        default: "1024x1024",
        help: "例如 1024x1024。",
      },
      {
        key: "seed",
        label: "Seed",
        kind: "number",
        help: "官方 Images API 可能拒绝 seed。留空则不传。",
      },
    ],
  }),
  defineNode({
    type: "comfyui.image",
    title: "ComfyUI",
    category: "image",
    summary: "外部 ComfyUI HTTP API（/prompt）。本周不会执行，也不内置 GPL 源码。",
    executable: false,
    fields: [],
    ports: [
      { id: "prompt", name: "prompt", direction: "input", dataType: "text" },
      { id: "image", name: "image", direction: "output", dataType: "image" },
    ],
  }),
  defineNode({
    type: "video.wan-kling",
    title: "视频 Wan / Kling",
    category: "video",
    summary: "Wan 或 Kling 的异步视频任务。本周不会提交任务。",
    executable: false,
    fields: [],
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
    summary: "微软 Edge 在线语音。本周不会请求，也不链接 LGPL 的 edge-tts 包。",
    executable: false,
    fields: [],
    ports: [
      { id: "text", name: "text", direction: "input", dataType: "text" },
      { id: "audio", name: "audio", direction: "output", dataType: "audio" },
    ],
  }),
  defineNode({
    type: "tts.cosyvoice",
    title: "CosyVoice",
    category: "audio",
    summary: "本地 CosyVoice HTTP 服务（Apache-2.0）。本周不会连接。",
    executable: false,
    fields: [],
    ports: [
      { id: "text", name: "text", direction: "input", dataType: "text" },
      { id: "audio", name: "audio", direction: "output", dataType: "audio" },
    ],
  }),
  defineNode({
    type: "storyboard.board",
    title: "分镜",
    category: "storyboard",
    summary: "分镜板占位。把文本收成 storyboard 端口。本周不会生成镜头。",
    executable: false,
    fields: [],
    ports: [
      { id: "prompt", name: "prompt", direction: "input", dataType: "text" },
      { id: "board", name: "board", direction: "output", dataType: "storyboard" },
    ],
  }),
];

/** Week 1 export name. Same list as `nodeCatalog`. */
export const stubCatalog = nodeCatalog;
