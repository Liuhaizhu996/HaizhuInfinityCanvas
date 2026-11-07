# Haizhu Infinity Canvas — Design Brief (v1.0.0-beta.2)

## Design Read
Product UI redesign of an infinite-canvas creative workshop for **image and video artists**, with a dark cinematic studio language, quiet tool chrome, and content-first media nodes. Not a marketing landing page. Not a purple AI SaaS kit.

## Audience
Artists and directors who think in stills, clips, and storyboards. They care about preview fidelity, calm focus while wiring graphs, and a surface that feels like a high-end DCC / Runway-class studio, not a dashboard template.

## Dials
- DESIGN_VARIANCE: 5 (balanced, tool-like, slight asymmetry in panels)
- MOTION_INTENSITY: 4 (state feedback + panel enter only; honor prefers-reduced-motion)
- VISUAL_DENSITY: 7 (cockpit: tight inspector, generous canvas)

## Token plan (locked)

### Color (dark-only product chrome; light optional later)
| Role | Hex | Notes |
|------|-----|-------|
| Background / canvas void | `#0A0A0B` | near-black, not pure #000 |
| Surface elevated | `#141416` | top bar, side panels |
| Surface glass | `rgba(20,20,22,0.72)` | frosted overlays; blur 16px |
| Border | `rgba(255,255,255,0.08)` | hairlines |
| Foreground | `#F4F4F5` | primary text |
| Muted | `#A1A1AA` | secondary labels |
| Accent | `#F43F5E` | rose — run / primary CTA (not AI purple) |
| Accent soft | `#FB7185` | hover |
| Success | `#34D399` | engine online |
| Warning | `#FBBF24` | needs key |
| Danger | `#EF4444` | error / cancel destructive |
| Port text | `#38BDF8` | sky |
| Port image | `#A78BFA` | soft violet (ports only) |
| Port video | `#F472B6` | pink |
| Port audio | `#34D399` | mint |
| Port storyboard | `#FBBF24` | amber |

**Anti-defaults:** no `#7C3AED` product primary, no Inter-as-default brand face, no cream/brass luxury kit, no neon outer glows, no emoji icons.

### Typography
- UI / headings: **Outfit** (400–700)
- Body / inspector: **Work Sans** (400–600)
- Mono / ids / paths: **JetBrains Mono** or system `ui-monospace`
- Chinese: keep system CJK stack after Latin (`"PingFang SC", "Noto Sans SC", sans-serif`)
- Sentence case labels. No ALL-CAPS eyebrows as decoration.

### Layout concept
```
┌─ top bar (48–56px): project · engine pill · run/cancel · save/open · settings ─┐
│ left rail (240–280px)     │           infinite canvas              │ right   │
│ Agent library (search,    │  soft void, subtle grid, soft nodes    │ inspect │
│ groups: LLM / Image /     │  media preview dominates node body     │ or      │
│ Video / Audio / Board)    │  ports as small typed dots             │ empty   │
└───────────────────────────┴────────────────────────────────────────┴─────────┘
```
- Glass top bar + side rails over the canvas (backdrop-blur), solid fallback if `prefers-reduced-transparency`.
- Nodes: soft 12px radius, thin border, title row + large preview slot for image/video/audio.
- Selection: 1px accent ring, not thick glow.
- Empty canvas: one calm invitation (add agent / drop), no scroll cues, no version stamp hero.

### Motion
- Panel open/close 180–220ms ease-out
- Node select / run state: opacity + border only
- No perpetual float/shimmer on idle chrome
- Skip nonessential motion under `prefers-reduced-motion`

### Icons
One family only: **Phosphor** (preferred) or existing Lucide if already locked — do not mix. Stroke 1.5.

### Principles
1. Media is the hero; chrome stays quiet.
2. One accent for actions; port colors only for type literacy.
3. Chinese primary UI copy stays natural; no filler marketing verbs.
4. Keep Week 1–3 behaviors (DnD, .hzcanvas, run pipeline) intact.
5. shadcn/Radix primitives OK if restyled to these tokens — never ship default shadcn look.

## Canvas interaction

These patterns belong to Haizhu. They were informed by studying public creator-canvas products, and they are not a copy of any other brand, logo, or tool suite.

- Empty canvas invites a local image drop, a double-click to pick a node, or a drag from the node library. Nothing runs until the user presses 运行.
- A dropped image becomes an image node with a session-only preview. The bytes stay out of the `.hzcanvas` file.
- A glass dock at the bottom center runs the selection, or the whole graph when nothing is selected. One press, no batch, no silent retry, no credit badge.
- The bottom-right cluster arranges node positions (edges stay), shows the zoom percent, and fits the view.
- A selected image, video, or audio node gets a slim bar: run that node, or focus the inspector. No retouch toolbelt.

## Scope for implementation agent
See CloudAgent prompt. Persist this brief in `docs/design/MASTER.md` in the repo.
