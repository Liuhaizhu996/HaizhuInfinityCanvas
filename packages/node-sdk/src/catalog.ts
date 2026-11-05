import { defineNode, type NodeDefinition } from "./define-node";

/**
 * First-party manifests. Chat, image, ComfyUI, and Wan/Kling are executable.
 * Speech and storyboard stay in the library so a graph can be saved, but the
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
    summary: "本机 ComfyUI 的 HTTP API。把提示词写入你提供的 API 工作流，再轮询 /history。",
    executable: true,
    ports: [
      { id: "prompt", name: "prompt", direction: "input", dataType: "text" },
      { id: "image_in", name: "image", direction: "input", dataType: "image" },
      { id: "image", name: "image", direction: "output", dataType: "image" },
    ],
    fields: [
      {
        key: "prompt",
        label: "提示词",
        kind: "textarea",
        placeholder: "连上上游文本时，以上游为准。",
      },
      {
        key: "baseUrl",
        label: "ComfyUI 地址",
        kind: "text",
        placeholder: "http://127.0.0.1:8188",
        help: "留空则用设置里的 COMFYUI_BASE_URL。这不是密钥。",
      },
      {
        key: "workflow",
        label: "工作流 JSON",
        kind: "textarea",
        placeholder: '{"6":{"class_type":"CLIPTextEncode","inputs":{"text":"{{prompt}}"}}}',
        help: "ComfyUI 的 Save (API Format)。可用 {{prompt}}、{{image}}。{{seed}} 必须独占一个输入值。",
      },
      {
        key: "workflowPath",
        label: "工作流文件",
        kind: "text",
        placeholder: "workflows/demo.json",
        help: "工作流 JSON 为空时读取。相对路径必须在 engine/ 内，也可以填本机绝对路径。",
      },
      {
        key: "promptNode",
        label: "提示词节点",
        kind: "text",
        placeholder: "6",
        help: "工作流节点 id。留空则替换 {{prompt}}，否则写入第一个 CLIPTextEncode。",
      },
      { key: "promptInput", label: "提示词字段", kind: "text", default: "text" },
      {
        key: "imageNode",
        label: "图像节点",
        kind: "text",
        placeholder: "1",
        help: "连了参考图时写入该节点。留空则找 LoadImage 或 {{image}}。",
      },
      { key: "imageInput", label: "图像字段", kind: "text", default: "image" },
      {
        key: "seed",
        label: "Seed",
        kind: "number",
        help: "写入 {{seed}}。留空则不改工作流里的种子。",
      },
      {
        key: "timeoutSec",
        label: "超时（秒）",
        kind: "number",
        help: "留空为 300。到点会中断 ComfyUI，不会自动重试。",
      },
    ],
  }),
  defineNode({
    type: "video.wan-kling",
    title: "视频 Wan / Kling",
    category: "video",
    summary: "同一个节点。供应商选 Wan 或 Kling。提交一次异步任务后轮询，超时即停，不会自动重试。",
    executable: true,
    ports: [
      { id: "prompt", name: "prompt", direction: "input", dataType: "text" },
      { id: "image", name: "image", direction: "input", dataType: "image" },
      { id: "video", name: "video", direction: "output", dataType: "video" },
    ],
    fields: [
      {
        key: "prompt",
        label: "提示词",
        kind: "textarea",
        placeholder: "连上上游文本时，以上游为准。",
      },
      {
        key: "vendor",
        label: "供应商",
        kind: "select",
        default: "wan",
        options: [
          { value: "wan", label: "万相 Wan" },
          { value: "kling", label: "可灵 Kling" },
        ],
        help: "密钥在「设置」里，不会写进画布。",
      },
      {
        key: "model",
        label: "模型",
        kind: "text",
        default: "wan2.6-t2v",
        help: "Wan 文生默认 wan2.6-t2v；连了图像且仍是这个默认值时改用 wan2.6-i2v。选 Kling 且模型仍是这个默认值时改用 kling-v2-master。",
      },
      {
        key: "size",
        label: "尺寸",
        kind: "text",
        default: "1280*720",
        help: "Wan 文生：1280*720。图生或 Wan3：720P。Kling：16:9、9:16、1:1。",
      },
      {
        key: "duration",
        label: "时长（秒）",
        kind: "number",
        default: 5,
        help: "供应商不支持的时长会直接失败，不会重试。",
      },
      {
        key: "mode",
        label: "模式",
        kind: "text",
        default: "std",
        help: "Kling 常用 std 或 pro。Wan 忽略此项。",
      },
      { key: "seed", label: "Seed", kind: "number", help: "只传给 Wan。留空则不传。" },
      {
        key: "timeoutSec",
        label: "超时（秒）",
        kind: "number",
        help: "留空为 600。到点停止轮询，不会再次提交。",
      },
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
