/**
 * Language Handler Manager
 * 语言处理管理器
 * Responsible for registering and managing all language handler modules
 * 负责注册和管理所有语言处理模块
 */

import { LanguageHandler, DirectoryDescription, VersionInfo, DocEntry, ComplexityConfig, ImportResolveConfig } from './base.js';

// Pre-import language handler modules / 预导入语言处理模块
import { JavaScriptHandler } from './javascript.js';
import { PythonHandler } from './python.js';
import { GoHandler } from './go.js';
import { RustHandler } from './rust.js';
import { JavaHandler } from './java.js';
import { RubyHandler } from './ruby.js';
import { PhpHandler } from './php.js';
import { DotNetHandler } from './dotnet.js';

/**
 * File extension to language mapping / 文件扩展名到语言的映射
 */
const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  // JavaScript/TypeScript
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'javascript',
  '.tsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.vue': 'javascript',
  '.svelte': 'javascript',
  '.astro': 'javascript',
  // Python
  '.py': 'python',
  '.pyi': 'python',
  // Go
  '.go': 'go',
  // Rust
  '.rs': 'rust',
  // Java
  '.java': 'java',
  '.kt': 'java',
  '.scala': 'java',
  // Ruby
  '.rb': 'ruby',
  // PHP
  '.php': 'php',
  // .NET
  '.cs': 'dotnet',
  '.fs': 'dotnet',
  '.vb': 'dotnet',
};

/**
 * Language Handler Manager class / 语言处理管理器类
 */
export class LanguageHandlerManager {
  private static instance: LanguageHandlerManager;
  private handlers: Map<string, LanguageHandler> = new Map();

  /**
   * Private constructor to prevent external instantiation / 私有构造函数，防止外部实例化
   */
  private constructor() {
    this.registerHandlers();
  }

  /**
   * Get singleton instance / 获取单例实例
   */
  public static getInstance(): LanguageHandlerManager {
    if (!LanguageHandlerManager.instance) {
      LanguageHandlerManager.instance = new LanguageHandlerManager();
    }
    return LanguageHandlerManager.instance;
  }

  /**
   * Register all language handler modules / 注册所有语言处理模块
   */
  private registerHandlers(): void {
    const handlers = [
      new JavaScriptHandler(),
      new PythonHandler(),
      new GoHandler(),
      new RustHandler(),
      new JavaHandler(),
      new RubyHandler(),
      new PhpHandler(),
      new DotNetHandler(),
    ];

    handlers.forEach(handler => {
      const languageId = handler.getLanguageId();
      this.handlers.set(languageId, handler);
      // Register aliases / 注册别名
      this.registerAliases(handler);
    });
  }

  /**
   * Register language aliases / 注册语言别名
   */
  private registerAliases(handler: LanguageHandler): void {
    const aliases = handler.getAliases();
    aliases.forEach(alias => {
      this.handlers.set(alias.toLowerCase(), handler);
    });
  }

  /**
   * Get language handler by language ID
   * 根据语言ID获取语言处理模块
   * @param languageId Language identifier / 语言标识符
   */
  public getHandler(languageId: string): LanguageHandler | null {
    if (!languageId) {
      return null;
    }
    const normalizedId = languageId.toLowerCase();
    return this.handlers.get(normalizedId) || null;
  }

  /**
   * Get list of all supported languages (display names) / 获取所有支持的语言列表（显示名称）
   */
  public getSupportedLanguages(): string[] {
    return Array.from(new Set(
      Array.from(this.handlers.values()).map(handler => handler.getLanguageName())
    ));
  }

  /**
   * Get list of all supported language IDs / 获取所有支持的语言ID列表
   */
  public getSupportedLanguageIds(): string[] {
    const ids = new Set<string>();
    for (const handler of this.handlers.values()) {
      ids.add(handler.getLanguageId());
    }
    return Array.from(ids);
  }

  /**
   * Detect language from file extension
   * 根据文件扩展名检测语言
   * @param filePath File path / 文件路径
   */
  public detectLanguageFromFile(filePath: string): string | null {
    const { extname } = require('path');
    const ext = extname(filePath).toLowerCase();
    return EXTENSION_LANGUAGE_MAP[ext] || null;
  }

  /**
   * Detect primary language used in the project from project directory
   * 根据项目目录检测主要使用的语言
   * @param projectRoot Project root directory / 项目根目录
   */
  public detectProjectLanguages(projectRoot: string): string[] {
    const { existsSync } = require('fs');
    const { resolve } = require('path');
    const detectedLanguages: string[] = [];

    for (const handler of this.handlers.values()) {
      const indicators = handler.getProjectIndicators();
      for (const indicator of indicators) {
        if (indicator.includes('*')) {
          // Handle wildcards / 处理通配符
          const dir = resolve(projectRoot, indicator.split('/')[0]);
          if (existsSync(dir)) {
            try {
              const files = require('fs').readdirSync(dir);
              const pattern = new RegExp('^' + indicator.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
              if (files.some((f: string) => pattern.test(f))) {
                detectedLanguages.push(handler.getLanguageId());
                break;
              }
            } catch {
              // Ignore errors / 忽略错误
            }
          }
        } else {
          const indicatorPath = resolve(projectRoot, indicator);
          if (existsSync(indicatorPath)) {
            detectedLanguages.push(handler.getLanguageId());
            break;
          }
        }
      }
    }

    return [...new Set(detectedLanguages)];
  }

  /**
   * Get directory descriptions (by language)
   * 获取目录描述（根据语言）
   * @param languageId Language identifier / 语言标识符
   */
  public getDirectoryDescriptions(languageId: string): DirectoryDescription {
    const handler = this.getHandler(languageId);
    if (handler) {
      return handler.getDirectoryDescriptions();
    }
    // Return generic directory descriptions / 返回通用目录描述
    return {
      src: "源代码目录，包含所有主要的应用程序代码",
      test: "测试文件目录，包含单元测试和集成测试",
      tests: "测试文件目录，包含单元测试和集成测试",
      docs: "文档目录，包含项目文档和说明",
      examples: "示例代码目录，包含使用示例",
      bin: "可执行文件目录，包含 CLI 命令脚本",
      lib: "库文件目录",
      dist: "构建输出目录",
      build: "构建脚本和配置目录",
      config: "配置文件目录",
    };
  }

  /**
   * Detect project types (by language)
   * 检测项目类型（根据语言）
   * @param languageId Language identifier / 语言标识符
   * @param projectRoot Project root directory / 项目根目录
   */
  public async detectProjectTypes(
    languageId: string,
    projectRoot: string
  ): Promise<{ types: string[]; packageManager?: string[]; frameworks?: string[] }> {
    const handler = this.getHandler(languageId);
    if (handler) {
      return await handler.detectProjectTypes(projectRoot);
    }
    return { types: [] };
  }

  /**
   * Find entry files (by language)
   * 查找入口文件（根据语言）
   * @param languageId Language identifier / 语言标识符
   * @param files List of all files / 所有文件列表
   * @param projectRoot Project root directory / 项目根目录
   */
  public async findEntryPoints(
    languageId: string,
    files: string[],
    projectRoot: string
  ): Promise<string[]> {
    const handler = this.getHandler(languageId);
    if (handler) {
      return await handler.findEntryPoints(files, projectRoot);
    }
    return [];
  }

  /**
   * Detect runtime versions (by language)
   * 检测运行时版本（根据语言）
   * @param languageId Language identifier / 语言标识符
   * @param projectRoot Project root directory / 项目根目录
   */
  public async detectVersions(
    languageId: string,
    projectRoot: string
  ): Promise<VersionInfo> {
    const handler = this.getHandler(languageId);
    if (handler) {
      return await handler.detectVersions(projectRoot);
    }
    return {};
  }

  /**
   * Detect code standards (by language)
   * 检测代码规范（根据语言）
   * @param languageId Language identifier / 语言标识符
   * @param projectRoot Project root directory / 项目根目录
   */
  public async detectCodeStandards(
    languageId: string,
    projectRoot: string
  ): Promise<string[]> {
    const handler = this.getHandler(languageId);
    if (handler) {
      return await handler.detectCodeStandards(projectRoot);
    }
    return [];
  }

  /**
   * Extract documentation (auto-detect language from file)
   * 提取文档（根据文件自动检测语言）
   * @param content File content / 文件内容
   * @param filePath File path / 文件路径
   */
  public extractDocs(content: string, filePath: string): DocEntry[] {
    const languageId = this.detectLanguageFromFile(filePath);
    if (languageId) {
      const handler = this.getHandler(languageId);
      if (handler) {
        return handler.extractDocs(content, filePath);
      }
    }
    return [];
  }

  /**
   * Get source code extensions for all languages / 获取所有语言的源代码扩展名
   */
  public getAllSourceExtensions(): string[] {
    const extensions: string[] = [];
    for (const handler of this.handlers.values()) {
      extensions.push(...handler.getCommonSourceExtensions());
    }
    return [...new Set(extensions)];
  }

  /**
   * Get test file extensions for all languages / 获取所有语言的测试文件扩展名
   */
  public getAllTestExtensions(): string[] {
    const extensions: string[] = [];
    for (const handler of this.handlers.values()) {
      extensions.push(...handler.getCommonTestExtensions());
    }
    return [...new Set(extensions)];
  }

  /**
   * Get config files for all languages / 获取所有语言的配置文件
   */
  public getAllConfigFiles(): string[] {
    const files: string[] = [];
    for (const handler of this.handlers.values()) {
      files.push(...handler.getCommonConfigFiles());
    }
    return [...new Set(files)];
  }

  /**
   * Get directory descriptions for multiple languages
   * 获取多种语言的目录描述
   * @param languageIds List of language IDs / 语言ID列表
   */
  public getDirectoryDescriptionsForLanguages(languageIds: string[]): DirectoryDescription {
    const mergedDescriptions: DirectoryDescription = {};

    for (const languageId of languageIds) {
      const descriptions = this.getDirectoryDescriptions(languageId);
      Object.assign(mergedDescriptions, descriptions);
    }

    return mergedDescriptions;
  }

  /**
   * Detect runtime versions for multiple languages
   * 检测多种语言的运行时版本
   * @param languageIds List of language IDs / 语言ID列表
   * @param projectRoot Project root directory / 项目根目录
   */
  public async detectVersionsForLanguages(
    languageIds: string[],
    projectRoot: string
  ): Promise<VersionInfo> {
    const mergedVersions: VersionInfo = {};

    for (const languageId of languageIds) {
      const versions = await this.detectVersions(languageId, projectRoot);
      Object.assign(mergedVersions, versions);
    }

    return mergedVersions;
  }

  /**
   * Find entry files for multiple languages
   * 查找多种语言的入口文件
   * @param languageIds List of language IDs / 语言ID列表
   * @param files List of all files / 所有文件列表
   * @param projectRoot Project root directory / 项目根目录
   */
  public async findEntryPointsForLanguages(
    languageIds: string[],
    files: string[],
    projectRoot: string
  ): Promise<string[]> {
    const mergedEntryPoints: string[] = [];

    for (const languageId of languageIds) {
      const entryPoints = await this.findEntryPoints(languageId, files, projectRoot);
      mergedEntryPoints.push(...entryPoints);
    }

    return [...new Set(mergedEntryPoints)];
  }

  /**
   * Detect code standards for multiple languages
   * 检测多种语言的代码规范
   * @param languageIds List of language IDs / 语言ID列表
   * @param projectRoot Project root directory / 项目根目录
   */
  public async detectCodeStandardsForLanguages(
    languageIds: string[],
    projectRoot: string
  ): Promise<string[]> {
    const mergedStandards: string[] = [];

    for (const languageId of languageIds) {
      const standards = await this.detectCodeStandards(languageId, projectRoot);
      mergedStandards.push(...standards);
    }

    return [...new Set(mergedStandards)];
  }

  /**
   * Get complexity analysis config for a file
   * 获取文件对应的复杂度分析配置
   * @param filePath File path / 文件路径
   */
  public getComplexityConfigForFile(filePath: string): ComplexityConfig | null {
    const languageId = this.detectLanguageFromFile(filePath);
    if (languageId) {
      const handler = this.getHandler(languageId);
      if (handler) {
        return handler.getComplexityConfig();
      }
    }
    return null;
  }

  /**
   * Get import resolve config for a file
   * 获取文件对应的 import 解析配置
   * @param filePath File path / 文件路径
   */
  public getImportResolveConfigForFile(filePath: string): ImportResolveConfig | null {
    const languageId = this.detectLanguageFromFile(filePath);
    if (languageId) {
      const handler = this.getHandler(languageId);
      if (handler) {
        return handler.getImportResolveConfig();
      }
    }
    return null;
  }

  /**
   * Get exclusion directories for all languages (merged and deduplicated)
   * 获取所有语言的排除目录（合并去重）
   */
  public getAllExcludeDirs(): string[] {
    const dirs: string[] = [];
    const seen = new Set<string>();
    for (const handler of this.handlers.values()) {
      const id = handler.getLanguageId();
      if (seen.has(id)) continue;
      seen.add(id);
      dirs.push(...handler.getExcludeDirs());
    }
    return [...new Set(dirs)];
  }

  /**
   * Check if project has a frontend layer (based on detected languages and project types)
   * 检查项目是否有前端层（根据检测到的语言和项目类型）
   */
  public hasFrontendLayer(languageIds: string[], projectTypes: string[]): boolean {
    for (const languageId of languageIds) {
      const handler = this.getHandler(languageId);
      if (handler && handler.hasFrontendLayer(projectTypes)) {
        return true;
      }
    }
    return false;
  }
}

/**
 * Export language handler manager instance / 导出语言处理管理器实例
 */
export const languageHandlerManager = LanguageHandlerManager.getInstance();
