# 健康提醒动画设计规范

> 配套：[开发方案](health-reminder-development-plan.md)。本规范定义健康提醒动画的视觉/动效标准、
> 命名、首版素材清单与逐个分镜，供绘制与实现对齐。
> 主题：clawd（像素螃蟹）、cloudling（云朵）、calico（三花猫）。
> 日期：2026-06-15

## 1. 技术与风格基线（与现有素材对齐）

- **格式**：动画 SVG（内联 SMIL `<animate>`/`<animateTransform>` 或 SVG 内 `<style>` CSS keyframes），
  与 `themes/clawd/assets/clawd-react-*.svg`、`clawd-working-*.svg` 同构。单文件自包含、可独立加载。
- **画布**：沿用主题 `viewBox`。clawd 为 `-15 -25 45 45`（见 `themes/clawd/theme.json`）。
  cloudling/calico 用各自 theme.json 的 viewBox。新动画须与同主题既有素材**同坐标系、同基线**，
  避免播放时跳位。
- **像素风**：clawd 保持像素网格对齐与既有调色板；cloudling 柔和圆角；calico 三花配色。
  三者共用各自既有「角色本体」造型，仅叠加动作与小道具。
- **循环**：身体动画为短循环（建议 3.5–5s/循环），`repeatCount="indefinite"`；实际显示时长由
  `theme.healthReminders[key].duration` 控制覆盖层停留时间（到点 `resumeFromReaction`）。
- **性能**：避免滤镜/大位图；变换优先用 transform；与既有 SVG 一样可被低功耗暂停/恢复。
- **无障碍**：动作幅度温和；v2 接入「减少动态」时可降级为低幅或静态首帧。

## 2. 命名约定

- 文件：`{theme}-health-{key}.svg`，例如 `clawd-health-drink.svg`。
- 动画键 `key`（与 `theme.json.healthReminders` 及提醒 `animationKey` 一致）：
  `drink` / `stretch` / `eat` / `offwork` / `eyerest`（v2 追加：`breathe` / `posture` / `walk` / `snack` / `sleeptime`）。
- 道具子元素 id 用 `hr-` 前缀（如 `hr-cup`、`hr-droplet`），避免与本体 id 冲突。

## 3. 首版素材清单（v1，仅 clawd 全套；cloudling/calico 回退）

| key | 提醒语义 | clawd 动作 | 建议时长 |
| --- | --- | --- | --- |
| drink | 喝水 | 举起水杯小口啜饮，水位下降，冒一颗水珠 | 4000ms |
| stretch | 久坐起身 | 站直、双钳上举伸懒腰，身体轻微回弹 | 4500ms |
| eat | 午饭 | 捧饭碗/便当，开心咀嚼，冒热气 | 4000ms |
| offwork | 下班 | 挥手告别，背上小包/合上笔记本，眼睛弯成微笑 | 4000ms |
| eyerest | 护眼远眺 | 闭眼深呼吸→望向远方，眼睛左右缓移 | 5000ms |

v1 的 cloudling/calico：`theme.json.healthReminders` 写齐同样的键，但 `file` 暂指向各自最接近的
现有表情（如 happy/attention/idle-look），保证功能可用、画面不破。v2 替换为下列专属分镜。

## 4. 逐个分镜（storyboard）

> 记法：每个动画给出关键帧（占循环时长的百分比）与动作要点。clawd 为首版必做；
> cloudling/calico 为 v2 目标设计，先在此固化创意以保证三主题气质统一。

### 4.1 drink（喝水）

- **clawd**：0% 本体 idle 微呼吸；15% 右钳举起水杯 `hr-cup` 至嘴边；30–60% 杯身轻倾、
  `hr-water` 水位两段下降、嘴部小幅开合；70% 放下杯子；80% 头顶冒一颗 `hr-droplet` 上浮淡出；
  100% 回 idle。
- **cloudling**：云朵下伸出小水滴吸管，吸食一颗悬浮水珠，云体微微鼓起再回落；顶部飘出小水汽。
- **calico**：猫低头舔舐小水碗 `hr-bowl`，耳朵随节奏轻动，尾巴尖左右摆，舔三下后抬头眯眼满足。

### 4.2 stretch（久坐起身）

- **clawd**：0% 坐姿/低伏；20% 身体上抬「站直」；35–65% 双钳上举、整体纵向拉伸 `scaleY` 略增、
  眼睛闭合用力；75% 回弹（轻微 overshoot）；85% 抖一下；100% 回 idle。
- **cloudling**：云体纵向拉长成柱状再回弹，两侧伸出小手上举，顶冒一缕舒展气流线。
- **calico**：经典猫式弓背伸展——前肢前伸、臀部上抬，尾巴竖起，随后立起抖毛。

### 4.3 eat（午饭）

- **clawd**：15% 双钳捧起 `hr-bento`（便当/饭碗）；30–70% 头部小幅前倾「咀嚼」循环两口、
  腮帮鼓动；碗口冒 `hr-steam` 两缕热气上升淡出；80% 满足眯眼；100% 收回。
- **cloudling**：云朵接住落下的小饭团，包裹后轻轻鼓动消化，顶部冒星星眼。
- **calico**：猫低头吃 `hr-bowl` 中的小鱼干，耳朵前倾，吃完舔嘴角（舌头一闪），尾巴满足竖立。

### 4.4 offwork（下班）

- **clawd**：10% 合上 `hr-laptop`；25% 背上 `hr-bag`；40–80% 右钳举起左右挥手两次（告别）、
  眼睛弯成 `^^` 微笑；90% 身体轻跳一下；100% 回 idle。
- **cloudling**：云朵关掉小台灯，挥出一只小手再见，整体向上飘一点表示「放松下班」。
- **calico**：猫合上小电脑，抬爪挥手喵一声（嘴小开），尾巴画一个轻松的弧。

### 4.5 eyerest（护眼远眺）

- **clawd**：0–20% 闭眼深呼吸（身体随呼吸缓胀缩）；30% 睁眼；35–85% 眼珠/视线缓慢左→右→左
  「望向远方」，头部极小幅跟随；90% 眨一下；100% 回 idle。强调「慢」。
- **cloudling**：云朵眼睛闭合飘动，随后睁开向远处投出一道柔和视线弧，眼神缓移。
- **calico**：猫坐定，眼睛先眯后睁，瞳孔随远处目标左右缓移，耳朵微转，尾巴静置轻摆。

## 5. 主题适配要点

- **clawd**：动作落在像素格上，水/热气/水珠等用既有像素粒子风格；表情用既有眼睛元件
  （参考 theme.json `eyeTracking.ids`），保持「同一只 clawd」。
- **cloudling**：以「形变」表达动作（拉伸、鼓胀、飘移）多于「肢体」，符合云朵气质。
- **calico**：突出猫科习性（弓背、舔舐、耳尾语言），动作更写实灵动。

## 6. 与系统的衔接

- 身体动画通过 `playHealthReminderAnimation(svg,duration)`（复刻 `playReaction`）以覆盖层播放，
  仅在宠物身体空闲时触发（见方案 §5.2）。
- 每个 key 的 `duration` 在 `theme.json.healthReminders` 配置，用户可在「动画/音效替换 →
  健康提醒动画」分区替换素材或调时长（复用反应动画的替换链路）。
- 文字气泡与身体动画解耦：忙碌时只显示气泡、不播身体动画——动画设计无需承担「文字提示」职责，
  专注表达动作即可。

## 7. 验收（动画维度）

- 同主题内与既有素材**无跳位、无基线漂移**、风格一致。
- 单循环时长 3.5–5s，动作温和不晃眼；可被暂停/恢复。
- 在「健康提醒动画」替换分区预览正常、可被替换/重置。
- clawd 五个动画 v1 完成；cloudling/calico v1 回退可用、v2 按本规范补齐。
