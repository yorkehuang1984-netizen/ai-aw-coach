# 🧠 AW-AI Coach

> 基于 ActivityWatch 本地数据的个人 AI 时间分析助手

用自然语言询问你的电脑使用情况，自动生成反思周报和可视化图表。无需登录、无需数据库、完全本地运行。

---

## ✨ 功能

| 功能 | 说明 |
|------|------|
| 💬 **自然语言查询** | 随口问"我今天用了多久浏览器？"，AI 根据真实数据回答 |
| 📄 **一键反思周报** | 自动分析本周时间分布，生成带建议的 Markdown 报告 |
| ⏱️ **时间分布图表** | 甜甜圈图可视化应用占比，支持今天/昨天/本周切换 |
| 🧠 **多轮对话** | 记住上下文，追问"昨天呢？"无需重复时间范围 |

---

## 🛠 技术栈

| 层级 | 技术 |
|------|------|
| 运行时 | Node.js 18+ |
| 后端框架 | Express |
| LLM | DeepSeek V4（兼容 OpenAI 协议） |
| 数据源 | ActivityWatch 本地 REST API |
| 前端 | 原生 HTML + CSS + JS |
| 图表 | Chart.js |

---

## 🚀 安装与运行

### 前提条件
- [Node.js](https://nodejs.org) 18+ 已安装
- [ActivityWatch](https://activitywatch.net) 正在运行
- [DeepSeek API Key](https://platform.deepseek.com) 已注册

### 方式一：一键安装（推荐）

```bash
# 第一步：双击 setup.bat，自动完成：
#   1. npm install
#   2. 编译桌面启动器 (.exe)
#   3. 创建桌面快捷方式

# 第二步：配置 API Key
cp .env.example .env
# 用记事本打开 .env，把 sk-你的key 替换成真实 key
```

然后双击桌面的 `AW-AI-Coach` 快捷方式即可。

### 方式二：命令行

```bash
# 1. 安装依赖
npm install

# 2. 配置 API Key
cp .env.example .env
# 用记事本打开 .env，把 sk-你的key 替换成真实 key

# 3. 启动
npm start
```

浏览器打开 `http://localhost:3000` 即可使用。

> 💡 Key 从 [platform.deepseek.com](https://platform.deepseek.com) 免费获取。

---

## 📁 项目结构

```
aw-ai-coach/
├── server.js              # Express 主入口
├── services/
│   ├── activitywatch.js   # ActivityWatch API 封装
│   └── deepseek.js        # DeepSeek 调用与 Prompt
├── prompts/
│   └── weekly.md          # 周报 System Prompt
├── public/
│   ├── index.html         # 前端页面
│   ├── style.css          # 样式
│   └── app.js             # 前端逻辑
└── .env                   # API Key（不提交到 Git）
```

---

## 📋 简历展示

**AW-AI Coach | 基于 ActivityWatch 的个人 AI 时间分析助手**

独立设计并全栈实现的本地 AI 应用（Node.js + Express + 原生前端 + DeepSeek V4 Pro）。通过对 ActivityWatch 本地 REST API 的封装与 Prompt Engineering，将原始窗口行为数据转化为可执行的效率洞察。

- **核心功能**：多轮自然语言时间查询、自动反思周报生成、交互式数据可视化
- **技术亮点**：LLM 集成（OpenAI 兼容协议）、RESTful API 设计、前后端分离架构、数据聚合与图表渲染（Chart.js）
- **工程实践**：独立完成需求分析 → 技术选型 → 全栈开发 → 发布的完整产品周期
- **能力体现**：利用 AI 辅助编程（Claude）从零交付可用产品，展示了快速学习、问题分解与工具运用能力

---

## 📝 License

MIT
