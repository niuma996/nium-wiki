/**
 * 语言处理基础接口
 * 定义各语言处理模块需要实现的方法
 */

/**
 * 目录描述接口
 */
export interface DirectoryDescription {
  [directory: string]: string;
}

/**
 * 版本信息接口
 */
export interface VersionInfo {
  [runtime: string]: string;
}

/**
 * 项目类型检测结果
 */
export interface ProjectTypeDetection {
  types: string[];
  packageManager?: string[];
  frameworks?: string[];
}

/**
 * 文档条目
 */
export interface DocEntry {
  name: string;
  type: 'function' | 'class' | 'method' | 'type' | 'interface';
  description: string;
  params: Array<{ name: string; type: string; description: string }>;
  returns: string | null;
  examples: string[];
  lineNumber: number;
  filePath: string;
}

/**
 * 代码规范检测结果
 */
export interface CodeStandardDetection {
  name: string;
  configFile: string;
}

/**
 * 复杂度分析配置
 */
export interface ComplexityConfig {
  /** 函数定义的正则模式列表 */
  functionPatterns: RegExp[];
  /** 分支关键字的正则模式 */
  branchPattern: RegExp;
  /** 嵌套深度计算策略：'braces' 基于花括号，'indentation' 基于缩进 */
  nestingStrategy: 'braces' | 'indentation';
}

/**
 * Import 解析配置
 */
export interface ImportResolveConfig {
  /** 模块解析时尝试补全的扩展名列表 */
  resolveExtensions: string[];
  /** 目录下的 index 文件名列表 */
  indexFiles: string[];
  /** 从文件内容中提取相对路径 import 的正则模式列表 */
  importPatterns: RegExp[];
  /** import 路径清理函数（如去除 .js 后缀） */
  cleanSpecifier?: (specifier: string) => string;
}

/**
 * 语言处理器接口
 */
export interface LanguageHandler {
  /**
   * 获取语言显示名称
   */
  getLanguageName(): string;

  /**
   * 获取语言标识符（用于内部查找）
   */
  getLanguageId(): string;

  /**
   * 获取语言别名
   */
  getAliases(): string[];

  /**
   * 获取项目指示器（配置文件列表）
   */
  getProjectIndicators(): string[];

  /**
   * 获取常见源代码扩展名
   */
  getCommonSourceExtensions(): string[];

  /**
   * 获取常见测试文件扩展名
   */
  getCommonTestExtensions(): string[];

  /**
   * 获取常见配置文件
   */
  getCommonConfigFiles(): string[];

  /**
   * 获取目录描述
   */
  getDirectoryDescriptions(): DirectoryDescription;

  /**
   * 检测项目类型（返回检测到的类型、包管理器、框架等）
   * @param projectRoot 项目根目录
   */
  detectProjectTypes(projectRoot: string): Promise<ProjectTypeDetection>;

  /**
   * 查找入口文件
   * @param files 所有文件列表
   * @param projectRoot 项目根目录
   */
  findEntryPoints(files: string[], projectRoot: string): Promise<string[]>;

  /**
   * 检测运行时版本
   * @param projectRoot 项目根目录
   */
  detectVersions(projectRoot: string): Promise<VersionInfo>;

  /**
   * 检测代码规范
   * @param projectRoot 项目根目录
   */
  detectCodeStandards(projectRoot: string): Promise<string[]>;

  /**
   * 从代码内容中提取文档
   * @param content 文件内容
   * @param filePath 文件路径
   */
  extractDocs(content: string, filePath: string): DocEntry[];

  /**
   * 获取复杂度分析配置
   */
  getComplexityConfig(): ComplexityConfig;

  /**
   * 获取 import 解析配置
   */
  getImportResolveConfig(): ImportResolveConfig;

  /**
   * 获取应排除的目录名列表
   */
  getExcludeDirs(): string[];

  /**
   * 是否具有前端层（用于架构图生成）
   */
  hasFrontendLayer(projectTypes: string[]): boolean;
}

/**
 * 通用查找入口文件方法配置
 */
interface FindEntryPointsConfig {
  commonEntries?: string[];
  configFileChecks?: Array<{
    filePath: string;
    parseFn: (content: string, files: string[]) => string[];
  }>;
  contentChecks?: Array<{
    pattern: RegExp;
    filter?: (file: string) => boolean;
  }>;
}

/**
 * 语言处理基础类，提供通用实现
 */
export abstract class BaseLanguageHandler implements LanguageHandler {
  /**
   * 获取通用目录描述
   */
  protected getCommonDirectoryDescriptions(): DirectoryDescription {
    return {
      src: "源代码目录，包含所有主要的应用程序代码",
      test: "测试文件目录，包含单元测试和集成测试",
      tests: "测试文件目录，包含单元测试和集成测试",
      docs: "文档目录，包含项目文档和说明",
      examples: "示例代码目录，包含使用示例",
      bin: "可执行文件目录，包含 CLI 命令脚本",
      lib: "库文件目录",
      libs: "库文件目录",
      dist: "构建输出目录",
      build: "构建脚本和配置目录",
      config: "配置文件目录",
      components: "组件目录",
      pages: "页面目录",
      public: "公共资源目录",
      assets: "静态资源目录",
      utils: "工具函数目录",
      helpers: "辅助函数目录",
      services: "服务层目录",
      models: "数据模型目录",
      controllers: "控制器目录",
      routes: "路由定义目录",
      middleware: "中间件目录",
      plugins: "插件目录",
      hooks: "钩子函数目录",
      types: "类型定义目录",
      interfaces: "接口定义目录",
      schemas: "数据结构定义目录",
      scripts: "脚本目录，包含构建、测试等脚本",
    };
  }

  /**
   * 获取语言显示名称（抽象方法，子类必须实现）
   */
  abstract getLanguageName(): string;

  /**
   * 获取语言标识符（抽象方法，子类必须实现）
   */
  abstract getLanguageId(): string;

  /**
   * 获取项目指示器（抽象方法，子类必须实现）
   */
  abstract getProjectIndicators(): string[];

  /**
   * 获取常见源代码扩展名（抽象方法，子类必须实现）
   */
  abstract getCommonSourceExtensions(): string[];

  /**
   * 获取常见测试文件扩展名（抽象方法，子类必须实现）
   */
  abstract getCommonTestExtensions(): string[];

  /**
   * 获取常见配置文件（抽象方法，子类必须实现）
   */
  abstract getCommonConfigFiles(): string[];

  /**
   * 获取目录描述（抽象方法，子类必须实现）
   */
  abstract getDirectoryDescriptions(): DirectoryDescription;

  /**
   * 获取语言别名（默认实现，子类可覆盖）
   */
  getAliases(): string[] {
    return [];
  }

  /**
   * 检测项目类型（默认实现，子类可覆盖）
   */
  async detectProjectTypes(projectRoot: string): Promise<ProjectTypeDetection> {
    const { existsSync } = await import('fs');
    const { readFileSync } = await import('fs');

    const types: string[] = [];
    const packageManager: string[] = [];
    const frameworks: string[] = [];

    // 检查项目指示器文件
    const indicators = this.getProjectIndicators();
    for (const indicator of indicators) {
      if (existsSync(indicator)) {
        types.push(this.getLanguageId());
        break;
      }
    }

    return { types, packageManager, frameworks };
  }

  /**
   * 查找入口文件（默认实现，子类可覆盖）
   */
  async findEntryPoints(files: string[], projectRoot: string): Promise<string[]> {
    // 默认实现，子类应该覆盖
    return [];
  }

  /**
   * 通用查找入口文件方法，子类可调用此方法来简化实现
   */
  protected async findEntryPointsByConfig(
    files: string[],
    projectRoot: string,
    options: FindEntryPointsConfig
  ): Promise<string[]> {
    const entryPoints: Set<string> = new Set();
    const { existsSync } = await import('fs');
    const { readFile } = await import('fs/promises');
    const { resolve } = await import('path');

    // 1. 检查常见入口文件
    if (options.commonEntries) {
      options.commonEntries.forEach(entry => {
        if (files.includes(entry)) {
          entryPoints.add(entry);
        } else if (entry.includes('*')) {
          // 处理通配符模式
          const regex = new RegExp(entry.replace(/\*/g, '[^/]+').replace(/\/\*\*/g, '.+'));
          files.forEach(file => {
            if (regex.test(file)) {
              entryPoints.add(file);
            }
          });
        }
      });
    }

    // 2. 检查配置文件中的入口点
    if (options.configFileChecks) {
      for (const check of options.configFileChecks) {
        const configPath = resolve(projectRoot, check.filePath);
        if (existsSync(configPath)) {
          try {
            const content = await readFile(configPath, 'utf-8');
            const foundEntries = check.parseFn(content, files);
            foundEntries.forEach(entry => entryPoints.add(entry));
          } catch {
            // 忽略配置文件解析错误
          }
        }
      }
    }

    // 3. 检查文件内容中的入口点
    if (options.contentChecks) {
      for (const check of options.contentChecks) {
        for (const file of files) {
          if (check.filter ? check.filter(file) : true) {
            try {
              const content = await readFile(resolve(projectRoot, file), 'utf-8');
              if (check.pattern.test(content)) {
                entryPoints.add(file);
              }
            } catch {
              // 忽略文件读取错误
            }
          }
        }
      }
    }

    return Array.from(entryPoints);
  }

  /**
   * 检测运行时版本（默认实现，子类可覆盖）
   */
  async detectVersions(projectRoot: string): Promise<VersionInfo> {
    return {};
  }

  /**
   * 检测代码规范（默认实现，子类可覆盖）
   */
  async detectCodeStandards(projectRoot: string): Promise<string[]> {
    return [];
  }

  /**
   * 通用检测代码规范方法，子类可调用此方法来简化实现
   */
  protected async detectCodeStandardsByFiles(
    projectRoot: string,
    standards: { [name: string]: string[] | { files: string[], contentCheck?: (content: string) => boolean } }
  ): Promise<string[]> {
    const detectedStandards: string[] = [];
    const { existsSync } = await import('fs');
    const { readFile } = await import('fs/promises');
    const { resolve } = await import('path');

    for (const [standardName, config] of Object.entries(standards)) {
      let found = false;

      if (Array.isArray(config)) {
        // 简单文件检查
        for (const file of config) {
          if (existsSync(resolve(projectRoot, file))) {
            found = true;
            break;
          }
        }
      } else {
        // 复杂检查：文件存在 + 内容检查
        for (const file of config.files) {
          const filePath = resolve(projectRoot, file);
          if (existsSync(filePath)) {
            if (config.contentCheck) {
              try {
                const content = await readFile(filePath, 'utf-8');
                if (config.contentCheck(content)) {
                  found = true;
                  break;
                }
              } catch {
                // 忽略文件读取错误
              }
            } else {
              found = true;
              break;
            }
          }
        }
      }

      if (found) {
        detectedStandards.push(standardName);
      }
    }

    return detectedStandards;
  }

  /**
   * 从代码内容中提取文档（默认实现，子类可覆盖）
   */
  extractDocs(content: string, filePath: string): DocEntry[] {
    return [];
  }

  /**
   * 获取复杂度分析配置（默认实现：C 风格花括号语言）
   */
  getComplexityConfig(): ComplexityConfig {
    return {
      functionPatterns: [
        /\bfunction\s+\w+/g,
      ],
      branchPattern: /\b(if|else if|case|for|while|catch|&&|\|\||\?)\b/g,
      nestingStrategy: 'braces',
    };
  }

  /**
   * 获取 import 解析配置（默认实现：空，子类应覆盖）
   */
  getImportResolveConfig(): ImportResolveConfig {
    return {
      resolveExtensions: [],
      indexFiles: [],
      importPatterns: [],
    };
  }

  /**
   * 获取应排除的目录名列表（默认实现：空，子类可覆盖）
   */
  getExcludeDirs(): string[] {
    return [];
  }

  /**
   * 是否具有前端层（默认 false，子类可覆盖）
   */
  hasFrontendLayer(_projectTypes: string[]): boolean {
    return false;
  }
}
