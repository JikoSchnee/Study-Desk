---
version: beta
name: Duolingo-inspired learning product
description: "面向中文学习工具的 Duolingo 产品体验参考：明确的学习路径、友好但克制的白底界面，以及按压式立体控件。"
sourceUrl: "https://www.duolingo.com"
brandGuides:
  - "https://design.duolingo.com/identity/color"
  - "https://design.duolingo.com/identity/typography"

colors:
  primary: "#58CC02"
  primary-pressed: "#58A700"
  primary-soft: "#EFFFF4"
  accent: "#1CB0F6"
  accent-pressed: "#1677B7"
  accent-soft: "#DDF4FF"
  background: "#FFFFFF"
  background-subtle: "#F7F7F7"
  text: "#4B4B4B"
  text-muted: "#777777"
  border: "#E5E5E5"
  danger: "#FF4B4B"
  danger-pressed: "#D93636"
  warning: "#FFC800"
  warning-pressed: "#D9A900"

typography:
  display:
    fontFamily: "Nunito, Avenir Next, Trebuchet MS, sans-serif"
    fontSize: "clamp(31px, 4vw, 46px)"
    fontWeight: 900
    lineHeight: 1.08
    letterSpacing: "-1.7px"
  hero:
    fontFamily: "Nunito, Avenir Next, Trebuchet MS, sans-serif"
    fontSize: "clamp(37px, 5vw, 58px)"
    fontWeight: 900
    lineHeight: 1.03
    letterSpacing: "-2.5px"
  heading:
    fontFamily: "Nunito, Avenir Next, Trebuchet MS, sans-serif"
    fontWeight: 900
  body:
    fontFamily: "Nunito, Avenir Next, Trebuchet MS, sans-serif"
    fontSize: 16px
    fontWeight: 700
    lineHeight: 1.55

spacing:
  base: 10px
  touchTarget: 44px
  desktopPagePadding: "46px 56px 92px"
  mobilePagePadding: "24px 18px 98px"

radius:
  control: 14px
  panel: 16px
  hero: 24px

motion:
  duration-fast: 150ms
  easing: "ease"
  reducedMotion: "disable non-essential transitions and animation"

breakpoints:
  mobile: 800px
  desktopReference: 1440px
  mobileReference: 390px
---

# Duolingo 产品体验参考

本规范用于“八股训练台”及相近的中文学习产品。它借鉴 Duolingo 的信息层级、色彩角色、学习路径和控件反馈；不复制品牌名称、Logo、角色、插画、音效或专有文案。产品必须保留自己的名称与内容。

Nunito 是官方建议的开源替代字体。界面应显得有鼓励感，但不能用大面积渐变、漂浮卡片或装饰性动画分散学习注意力。

## 1. 基本原则

1. **学习目标优先。** 每个页面应首先回答“现在做什么、完成后得到什么”。主行动永远只有一个。
2. **把进度做成路径。** 使用短任务、编号步骤、进度条、圆形任务标记和完成反馈，而不是泛化的 SaaS 数据面板。
3. **白底、细边、少阴影。** 普通内容容器使用 Snow 白底、2px 中性边框与圆角；只让可按压控件通过底边产生深度。
4. **短而直接的中文。** 标题、按钮和状态使用动词开头的短句，例如“开始今天任务”“查看卡片预览”“确认导入”。避免句号和冗长说明。
5. **绿色有语义。** Feather Green 只表示主行动、完成、进度和正向结果；不可把绿色均匀铺满整页。

## 2. 色彩角色

| 角色 | 色值 | 用途 |
| --- | --- | --- |
| Feather Green | `#58CC02` | 主 CTA、完成、进度填充 |
| Tree Frog | `#58A700` | 绿色按钮 4px 按压底边 |
| Macaw | `#1CB0F6` | 当前步骤、信息、键盘焦点、蓝色操作 |
| Humpback | `#1677B7` | 蓝色按钮按压底边、蓝色文字 |
| Snow | `#FFFFFF` | 页面与普通卡片背景 |
| Polar | `#F7F7F7` | 次级区域、折叠内容、代码或文件摘要 |
| Eel | `#4B4B4B` | 主文本与标题 |
| Cardinal | `#FF4B4B` | 删除、阻塞性错误 |
| Bee | `#FFC800` | 警示、需要注意但可继续的状态 |

不得使用旧的浅蓝全页背景 `#DDF4FF` 或浅绿色 `#A5ED6E` 作为默认页面主色。浅蓝和浅绿只能作为局部状态背景。

## 3. 立体控件：唯一允许的位移动效

所有主要操作遵循一致的“物理按压”模型：常态像有一条厚底边的按钮，按下时按钮向下压到底边位置。

```css
.button {
  min-height: 44px;
  padding: 8px 16px 10px;
  border: 2px solid var(--button-color);
  border-bottom: 4px solid var(--button-pressed-color);
  border-radius: 14px;
  font-weight: 900;
  transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease;
}

.button:hover {
  /* 仅改变颜色、边框或亮度；绝不移动按钮 */
}

.button:active {
  transform: translateY(4px);
  border-bottom-width: 0;
  padding-bottom: 8px;
}
```

- 主按钮：`#58CC02` 背景、`#58A700` 底边、白色粗体文字。
- 蓝色操作：`#1CB0F6` 背景、`#1677B7` 底边；用于选择文件、次主流程和信息动作。
- 轮廓按钮：Snow 背景、中性灰 2px 边框、略深的灰色 4px 底边。
- 危险按钮：Cardinal / 深红底边；警示按钮：Bee / 深黄底边。
- 禁用按钮保留原有高度与 4px 底边，只降低对比度并使用 `not-allowed` 指针。
- 图标按钮、要点排序按钮也使用边框和按压反馈，但可采用 2–3px 的较浅底边。

### 明确禁止

- `hover` 中使用 `translateX`、`translateY`、`scale`、阴影位移、弹跳或悬浮。
- 卡片、导航项、日历日期和上传区因为 hover 改变位置。
- 依赖模糊大阴影制造层级。

`translateY` 只允许出现在 `:active` 的按压状态；不得用于 hover。

## 4. 页面架构

### 首页：欢迎感 + 今日训练

- 顶部使用浅绿色 Hero，而非全页绿色：大标题、简短承诺、主行动和三项紧凑学习概览。
- 主行动链接到最需要处理的一项：有到期复习时进入复习，否则引导创建第一张卡片。
- Hero 下方使用“任务路径”：进度条、任务类型圆点、用时和完成按钮。
- 桌面右侧放入节奏、连续学习和下一项提示；这些是紧凑状态模块，不应成为大数据仪表盘。

### 学习产品页面

- 桌面结构：左侧固定主导航、中间学习主轴、右侧较窄的进度或提示栏。
- 中轴最大宽度约 930–1000px；避免让表单、复习题或报告横跨整块超宽屏幕。
- 移动端：隐藏侧栏，保留底部主导航，内容为单列；复习与面试必须保持聚焦的居中答题单元。
- 顶部用“类别 eyebrow + 大标题 + 一句解释”建立层级，标题不宜过长。

### 各业务场景

- **卡片与导入**：用课程式编号步骤表示“选择文件 → 映射列 → 审阅卡片”；已完成为绿色，当前为蓝色。预览应是“问题 + 答案要点”卡，而不是原始表格。
- **复习**：顶部显示进度与技术方向，中间只保留问题、回答输入、结果反馈与评分按钮。评分操作遵循同一按压模型。
- **面试**：启动页强调一场短练习；问答页使用大问题和专注输入区；报告页使用绿色描边的圆形评分与可回流知识点。
- **日历**：7 列轻边框日期格；当天为蓝色描边，完成度用绿色小圆点和数字共同表达。hover 仅改变底色和边框。
- **知识库、设置**：使用分段表单、列表与细分隔线；不使用大量漂浮卡片。

## 5. 导航、卡片与状态

- 侧边导航白底、2px 右分隔线；活跃项为浅绿色底 + 绿色文字/图标，hover 为浅蓝底 + 蓝色文字。二者都不移动。
- 普通面板：`#FFFFFF`、2px `#E5E5E5`、16px 圆角、24px 内边距、无默认阴影。
- Hero 和成功面板可使用局部浅绿底与浅绿边框；信息提示用浅蓝；警示用浅黄加文字/图标；错误用浅红加文字/图标。
- 标签采用小型圆角矩形与文字，不能只通过颜色说明“可导入、重复或需补充”。
- 空状态可有一个绿色圆角符号，但不能使用 Duolingo 吉祥物、插画或其轮廓。

## 6. 字体与可访问性

- 使用 Nunito 600、700、800、900。正文最低 16px；长答案行高至少 1.55。
- 所有可交互元素最小 44×44px。
- 键盘焦点使用至少 3px 的 Macaw 蓝色外环，不能依赖 hover。
- 成功、警告、错误、导入状态必须同时提供图标、文字或边框，不得只用颜色。
- 支持 `prefers-reduced-motion: reduce`：将非必要 transition 和 animation 减到最小。
- 中文按钮不模仿英文全大写；保持简短、粗体、动词明确即可。

## 7. 实施与验收清单

- [ ] `:hover` 不含 `transform`、`scale`、位移或阴影位移。
- [ ] 每个主/蓝/警示/危险/轮廓按钮都有底边与同样的按压规则。
- [ ] 按下时仅按钮本身下移到底边高度，松开后立即恢复。
- [ ] 页面背景为 Snow/Polar；绿色仅承载行动、进度和成功语义。
- [ ] 1440px 桌面展示侧栏、学习中轴和辅助信息；390px 手机展示单列与底部导航。
- [ ] 首页呈现欢迎 Hero 与任务路径；其他页面保持克制的学习产品界面。
- [ ] 不出现 Duolingo 的名称、商标、吉祥物、插画、音频或专有文案。
