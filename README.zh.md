<p align="center">
  <img src="assets/logo.jpg" alt="Nium-Wiki Logo" width="200" />
</p>

# Nium-Wiki

[English](README.md) | 中文

AI 编程工具（如 Claude Code）的 Skill，将代码库转化为高质量 Wiki。自动分析项目结构，生成带图表和交叉引用的文档。灵感来自 DeepWiki、ZRead、Code Wiki。

## 特性

- 🚀 **深度代码分析**：语义级理解代码逻辑，不仅限于语法解析
- 📊 **Mermaid 图表**：自动生成架构图、数据流图、依赖关系图
- 🔗 **交叉链接文档**：文档间双向链接，源码可追溯
- ⚡ **增量更新**：基于 SHA256 哈希的变更检测，高效再生成
- 🌐 **多语言支持**：支持 JS/TS/Python/Go/Rust/Java 等 10+ 语言
- 🔒 **完全离线**：零外部依赖，适用于气隙网络环境
- 📝 **专业输出**：企业级文档质量标准与自动审计

## 快速上手

### 安装

在使用 Nium-Wiki 之前，需要先将其添加为 AI 编程工具的 skill：

```bash
npx skills add https://github.com/niuma996/nium-wiki --skill nium-wiki
```

Nium-Wiki 作为AI编程工具 skill 使用（如Claude Code），直接对 AI 说：

```
# 在 Claude Code 中输入：
> 生成wiki
> 创建文档
> 更新wiki
> 重新构建wiki
```

Skill 会自动执行完整流程：初始化 → 项目分析 → 深度代码阅读 → 生成文档 → 构建索引 → 质量审计。

代码变更后增量更新：

```
> update wiki
```

通过 SHA256 哈希检测变更文件。`incremental` 命令结合 diff 分析、依赖图遍历和文档间传播，精准定位受影响的 Wiki 页面——仅重写变更部分，不多做。

### 生成产物结构

```
.nium-wiki/
├── config.json              # 语言和排除规则配置
├── meta.json                # 版本、时间戳、统计信息
├── cache/
│   ├── structure.json       # 项目结构快照
│   ├── source-index.json    # SHA256 文件哈希（变更检测）
│   ├── doc-index.json       # 源文件 ↔ 文档双向映射
│   └── dep-graph.json       # import/require 依赖图
└── wiki/                    # 生成的文档
    ├── index.md             # 项目首页
    ├── architecture.md      # 系统架构 + Mermaid 图表
    ├── getting-started.md   # 快速开始指南
    ├── doc-map.md           # 文档关系图
    ├── api/                 # API 参考文档
    ├── <domain>/            # 按业务域组织的模块文档
    │   ├── _index.md        # 域概览
    │   └── <module>.md      # 模块文档
    └── ...
```

### 多语言支持

```bash
# 初始化时指定主语言（第一语言） + 副语言
npx nium-wiki init --lang zh/en
```

副语言文档生成在 `wiki_{lang}/` 目录下（如 `.nium-wiki/wiki_en/`），与 `wiki/` 保持相同的目录结构。

### 本地预览

```bash
# 安装
npm install -g nium-wiki

# 启动本地文档服务器（默认端口 4000）
npx nium-wiki serve

# 指定端口
npx nium-wiki serve --port 3000

# 指定 Wiki 目录
npx nium-wiki serve .nium-wiki/wiki
```

浏览器访问 `http://localhost:4000` 即可预览生成的文档，支持全文搜索、侧边栏导航和 Mermaid 图表渲染。

### Wiki 生成效果展示

生成效果示例可参考 [claude-code-sourcemap-wiki](https://github.com/niuma996/claude-code-sourcemap-wiki)。

### 配置说明

初始化后会在 `.nium-wiki/config.json` 生成默认配置：

```json
{
  "language": "zh",
  "exclude": [
    "node_modules", ".git", "dist", "build",
    "coverage", "__pycache__", "venv", ".venv"
  ],
  "useGitignore": true
}
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `language` | `string` | `en` | 文档语言，支持 `zh`、`en`、`ja`、`ko`、`fr`、`de`。使用 `/` 分隔可配置多语言，如 `zh/en`（主语言为中文，副语言为英文） |
| `exclude` | `string[]` | 见上方 | 排除的目录列表，不参与代码分析和文档生成 |
| `useGitignore` | `boolean` | `true` | 是否自动读取 `.gitignore` 中的目录排除规则并合并到排除列表 |

> 除了 `config.json` 中的自定义排除项，工具还内置了一组通用排除目录（`.git`、`.idea`、`.vscode`、`node_modules`、`dist` 等）和各语言处理器提供的排除规则（如 Python 的 `__pycache__`、Go 的 `vendor` 等），无需手动配置。

## 离线优先设计

Nium-Wiki 设计为完全离线运行，**零外部依赖**， 完美适用于企业内部网络和气隙环境：

### 文档生成
- ✅ 徽章生成使用内联 SVG（无 shields.io 依赖）

### 预览服务
- ✅ 所有前端资源（Docsify、Prism.js、Mermaid）均本地打包
- ✅ 无 CDN 请求或外部 API 调用

## Token 开销说明

Nium-Wiki 的核心设计是利用 AI 编程工具在日常使用中对项目的理解（Explore 过程），引导工具以结构化方式输出文档，而非从零开始分析整个代码库。

| 场景 | Token 开销 | 说明 |
|------|-----------|------|
| 首次生成（已有 Explore 上下文） | 中等 | AI 工具已理解项目结构，直接进入文档生成阶段，开销取决于项目规模 |
| 首次生成（全新项目） | 较大 | 需要完整的代码阅读和分析过程，相当于一次深度 Explore + 文档生成 |
| 增量更新 | 很小 | 通过 SHA256 哈希检测代码变更，定位受影响的文档进行局部更新 |
| 多语言翻译 | 很小 | 在主语言文档生成完毕后进行翻译，同样支持增量更新逻辑 |

> 对于已经使用 AI 编程工具一段时间的项目，首次生成的开销通常在可接受范围内。日常使用中以增量更新为主，开销很小。

## 开发中的功能
- 持续优化文档效果，减少模型交互次数
- 集中式文档管理服务
- 智能检索工具（跨工程）

## 应用场景

- **企业文档管理**：为内部项目生成全面技术文档
- **开源项目**：自动维护最新文档
- **代码审查**：可视化架构和依赖关系
- **新人入职**：帮助新开发者快速理解代码库
- **气隙环境**：完全离线工作

## 贡献

欢迎贡献代码！请随时提交 Pull Request。

## 许可证

MIT

## 链接

- [GitHub 仓库](https://github.com/niuma996/nium-wiki)
- [问题追踪](https://github.com/niuma996/nium-wiki/issues)

---

*由 Nium-Wiki 用 ❤️ 生成*
