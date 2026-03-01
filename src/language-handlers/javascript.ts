/**
 * JavaScript/TypeScript 语言处理模块
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { BaseLanguageHandler, VersionInfo, ProjectTypeDetection, DocEntry, ComplexityConfig, ImportResolveConfig } from './base.js';

export class JavaScriptHandler extends BaseLanguageHandler {
  /**
   * 获取语言名称
   */
  getLanguageName(): string {
    return 'JavaScript/TypeScript';
  }

  /**
   * 获取语言标识符
   */
  getLanguageId(): string {
    return 'javascript';
  }

  /**
   * 获取语言别名
   */
  getAliases(): string[] {
    return ['js', 'typescript', 'ts', 'nodejs', 'node', 'node.js'];
  }

  /**
   * 获取项目指示器
   */
  getProjectIndicators(): string[] {
    return ['package.json', 'tsconfig.json'];
  }

  /**
   * 获取目录描述
   */
  getDirectoryDescriptions(): Record<string, string> {
    return {
      ...this.getCommonDirectoryDescriptions(),
      'src': '源代码目录，包含所有主要的 JavaScript/TypeScript 代码',
      'lib': '编译后的库文件目录',
      'dist': '构建输出目录，包含打包后的生产代码',
      'public': '公共资源目录，包含静态文件',
      'assets': '静态资源目录，包含图片、样式等',
      'components': 'React/Vue 组件目录',
      'pages': '页面组件目录',
      'hooks': 'React 钩子函数目录',
      'context': 'React 上下文目录',
      'redux': 'Redux 状态管理目录',
      'store': '状态管理目录',
      'actions': 'Redux 动作目录',
      'reducers': 'Redux 归约器目录',
      'slices': 'Redux Toolkit 切片目录',
      'middleware': '中间件目录',
      'utils': '工具函数目录',
      'helpers': '辅助函数目录',
      'services': 'API 服务目录',
      'api': 'API 接口目录',
      'models': '数据模型目录',
      'types': 'TypeScript 类型定义目录',
      'interfaces': 'TypeScript 接口定义目录',
      'schemas': '数据结构定义目录',
      'config': '配置文件目录',
      'scripts': '脚本目录，包含构建、测试等脚本',
      'test': '测试文件目录，包含单元测试和集成测试',
      'tests': '测试文件目录，包含单元测试和集成测试',
      '__tests__': 'Jest 测试文件目录',
      'spec': 'Jasmine/Mocha 测试文件目录',
      'docs': '文档目录，包含项目文档和说明',
      'examples': '示例代码目录，包含使用示例',
      'bin': '可执行文件目录，包含 CLI 命令脚本',
      'build': '构建脚本和配置目录',
    };
  }

  /**
   * 检测项目类型
   */
  async detectProjectTypes(projectRoot: string): Promise<ProjectTypeDetection> {
    const types: string[] = [];
    const packageManager: string[] = [];
    const frameworks: string[] = [];

    const pkgPath = resolve(projectRoot, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };

        // 包管理器
        if (existsSync(resolve(projectRoot, 'package-lock.json'))) packageManager.push('npm');
        if (existsSync(resolve(projectRoot, 'yarn.lock'))) packageManager.push('yarn');
        if (existsSync(resolve(projectRoot, 'pnpm-lock.yaml'))) packageManager.push('pnpm');
        if (existsSync(resolve(projectRoot, 'bun.lockb'))) packageManager.push('bun');

        // 基础类型
        if (existsSync(resolve(projectRoot, 'tsconfig.json'))) types.push('typescript');
        types.push('nodejs');

        // 框架检测
        if (deps.react) frameworks.push('react');
        if (deps.vue) frameworks.push('vue');
        if (deps.next || deps['next/font']) frameworks.push('nextjs');
        if (deps.nuxt || deps['@nuxt/core']) frameworks.push('nuxt');
        if (deps.svelte) frameworks.push('svelte');
        if (deps.solid) frameworks.push('solidjs');
        if (deps.angular || deps['@angular/core']) frameworks.push('angular');
        if (deps['@astrojs astro']) frameworks.push('astro');

        // 构建工具
        if (deps.vite || existsSync(resolve(projectRoot, 'vite.config.js')) || existsSync(resolve(projectRoot, 'vite.config.ts'))) {
          types.push('vite');
        }
        if (deps.webpack || existsSync(resolve(projectRoot, 'webpack.config.js'))) {
          types.push('webpack');
        }

        // 测试框架
        if (deps.jest || deps['@jest/globals']) types.push('jest');
        if (deps.vitest || deps['@vitest/ui']) types.push('vitest');
        if (deps.mocha) types.push('mocha');
        if (deps.jasmine) types.push('jasmine');

      } catch {
        // 忽略解析错误
      }
    }

    return { types, packageManager, frameworks };
  }

  /**
   * 检测运行时版本
   */
  async detectVersions(projectRoot: string): Promise<VersionInfo> {
    const versions: VersionInfo = {};
    const packageJsonPath = resolve(projectRoot, 'package.json');

    if (existsSync(packageJsonPath)) {
      try {
        const packageContent = readFileSync(packageJsonPath, 'utf-8');
        const pkg = JSON.parse(packageContent);
        if (pkg.engines) {
          if (pkg.engines.node) versions['Node.js'] = pkg.engines.node;
          if (pkg.engines.npm) versions['npm'] = pkg.engines.npm;
          if (pkg.engines.yarn) versions['yarn'] = pkg.engines.yarn;
          if (pkg.engines.pnpm) versions['pnpm'] = pkg.engines.pnpm;
        }
      } catch {
        // 忽略解析错误
      }
    }

    return versions;
  }

  /**
   * 查找入口文件
   */
  async findEntryPoints(files: string[], projectRoot: string): Promise<string[]> {
    return this.findEntryPointsByConfig(files, projectRoot, {
      commonEntries: [
        'index.js',
        'index.ts',
        'index.mjs',
        'index.cjs',
        'app.js',
        'app.ts',
        'main.js',
        'main.ts',
        'server.js',
        'server.ts',
        'src/index.js',
        'src/index.ts',
        'src/main.js',
        'src/main.ts',
        'src/app.js',
        'src/app.ts',
        'next.config.js',
        'next.config.mjs',
        'vite.config.js',
        'vite.config.ts',
        'webpack.config.js',
        'rollup.config.js',
      ],
      configFileChecks: [
        {
          filePath: 'package.json',
          parseFn: (content, files) => {
            const entryPoints: string[] = [];
            const pkg = JSON.parse(content);
            if (pkg.main) entryPoints.push(pkg.main as string);
            if (pkg.bin) {
              if (typeof pkg.bin === 'string') {
                entryPoints.push(pkg.bin);
              } else {
                entryPoints.push(...Object.values(pkg.bin as Record<string, string>));
              }
            }
            return entryPoints;
          }
        }
      ]
    });
  }

  /**
   * 检测代码规范
   */
  async detectCodeStandards(projectRoot: string): Promise<string[]> {
    const standardFiles = {
      'ESLint': ['.eslintrc.js', '.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml', '.eslintrc', 'eslint.config.js'],
      'Prettier': ['.prettierrc', '.prettierrc.json', '.prettierrc.yml', '.prettierrc.yaml', '.prettierrc.js', '.prettierrc.cjs', 'prettier.config.js'],
      'EditorConfig': ['.editorconfig'],
      'TypeScript': ['tsconfig.json'],
      'Flow': ['.flowconfig'],
      'Jest': ['jest.config.js', 'jest.config.ts', 'jest.config.json'],
      'Vitest': ['vitest.config.js', 'vitest.config.ts'],
      'Mocha': ['mocha.opts', '.mocharc.js', '.mocharc.json', '.mocharc.yml'],
      'Jasmine': ['jasmine.json'],
    };

    return this.detectCodeStandardsByFiles(projectRoot, standardFiles);
  }

  /**
   * 获取常见源代码扩展名
   */
  getCommonSourceExtensions(): string[] {
    return [
      '.js',
      '.mjs',
      '.cjs',
      '.jsx',
      '.ts',
      '.tsx',
      '.vue',
      '.svelte',
      '.astro',
    ];
  }

  /**
   * 获取常见测试文件扩展名
   */
  getCommonTestExtensions(): string[] {
    return [
      '.test.js',
      '.test.ts',
      '.test.jsx',
      '.test.tsx',
      '.spec.js',
      '.spec.ts',
      '.spec.jsx',
      '.spec.tsx',
    ];
  }

  /**
   * 获取常见配置文件
   */
  getCommonConfigFiles(): string[] {
    return [
      'package.json',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      'bun.lockb',
      'tsconfig.json',
      'tsconfig.node.json',
      'jsconfig.json',
      '.eslintrc.js',
      '.eslintrc.json',
      '.eslintrc.yml',
      '.eslintrc.yaml',
      'eslint.config.js',
      '.prettierrc',
      '.prettierrc.json',
      '.prettierrc.js',
      '.editorconfig',
      'vite.config.js',
      'vite.config.ts',
      'webpack.config.js',
      'webpack.config.ts',
      'rollup.config.js',
      'rollup.config.ts',
      'next.config.js',
      'next.config.mjs',
      'next.config.ts',
      'nuxt.config.js',
      'nuxt.config.ts',
      'astro.config.mjs',
      'astro.config.ts',
    ];
  }

  /**
   * 提取 JSDoc/TSDoc 注释
   */
  extractDocs(content: string, filePath: string): DocEntry[] {
    const entries: DocEntry[] = [];
    const jsdocPattern = /\/\*\*\s*([\s\S]*?)\*\/\s*(?:export\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type)\s+(\w+)/g;

    let match: RegExpExecArray | null;
    while ((match = jsdocPattern.exec(content)) !== null) {
      const docText = match[1];
      const name = match[2];
      const lineNumber = content.substring(0, match.index).split('\n').length;

      const descriptionLines: string[] = [];
      const params: Array<{ name: string; type: string; description: string }> = [];
      let returns: string | null = null;

      for (const line of docText.split('\n')) {
        const trimmed = line.trim().replace(/^\*\s?/, '');

        if (trimmed.startsWith('@param')) {
          const paramMatch = trimmed.match(/@param\s+\{([^}]+)\}\s+(\w+)\s*-?\s*(.*)/);
          if (paramMatch) {
            params.push({
              type: paramMatch[1],
              name: paramMatch[2],
              description: paramMatch[3],
            });
          }
        } else if (trimmed.startsWith('@returns') || trimmed.startsWith('@return')) {
          const returnMatch = trimmed.match(/@returns?\s+\{([^}]+)\}\s*(.*)/);
          if (returnMatch) {
            returns = `${returnMatch[1]}: ${returnMatch[2]}`;
          }
        } else if (trimmed.startsWith('@example')) {
          continue;
        } else if (!trimmed.startsWith('@')) {
          descriptionLines.push(trimmed);
        }
      }

      const description = descriptionLines.join(' ').trim();
      const fullMatch = match[0].toLowerCase();

      let entryType: DocEntry['type'] = 'function';
      if (fullMatch.includes('class')) entryType = 'class';
      else if (fullMatch.includes('interface')) entryType = 'interface';
      else if (fullMatch.includes('type')) entryType = 'type';

      entries.push({
        name,
        type: entryType,
        description,
        params,
        returns,
        examples: [],
        lineNumber: lineNumber,
        filePath: filePath,
      });
    }

    return entries;
  }

  getComplexityConfig(): ComplexityConfig {
    return {
      functionPatterns: [
        /\bfunction\s+\w+/g,
        /\b(async\s+)?(\w+)\s*\([^)]*\)\s*[:{]/g,
      ],
      branchPattern: /\b(if|else if|case|for|while|catch|&&|\|\||\?)\b/g,
      nestingStrategy: 'braces',
    };
  }

  getImportResolveConfig(): ImportResolveConfig {
    return {
      resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
      indexFiles: ['index.ts', 'index.tsx', 'index.js', 'index.jsx'],
      importPatterns: [
        /(?:import|export)\s+[\s\S]*?\s+from\s+['"](\.[^'"]+)['"]/g,
        /(?:import|export)\s+['"](\.[^'"]+)['"]/g,
        /require\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g,
        /import\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g,
      ],
      cleanSpecifier: (specifier: string) => specifier.replace(/\.js$/, ''),
    };
  }

  getExcludeDirs(): string[] {
    return ['node_modules', '.next', '.nuxt', '.svelte-kit', '.astro', 'dist', 'build', 'out', 'coverage', '.nyc_output', '.turbo', '.parcel-cache', '.webpack'];
  }

  hasFrontendLayer(projectTypes: string[]): boolean {
    return projectTypes.some(t =>
      ['react', 'vue', 'nextjs', 'nuxt', 'svelte', 'solidjs', 'angular', 'astro'].includes(t)
    );
  }
}
