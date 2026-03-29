/**
 * Go 语言处理模块
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { BaseLanguageHandler, VersionInfo, ProjectTypeDetection, ComplexityConfig, ImportResolveConfig } from './base';

export class GoHandler extends BaseLanguageHandler {
  getLanguageName(): string {
    return 'Go';
  }

  getLanguageId(): string {
    return 'go';
  }

  getAliases(): string[] {
    return ['golang', 'go-lang'];
  }

  getProjectIndicators(): string[] {
    return ['go.mod', 'go.sum'];
  }

  getDirectoryDescriptions(): Record<string, string> {
    return {
      ...this.getCommonDirectoryDescriptions(),
      'src': '源代码目录（传统 Go 项目结构）',
      'cmd': '命令行工具目录，包含可执行程序的入口点',
      'internal': '内部包目录，仅本项目可使用',
      'pkg': '可导出包目录，供其他项目使用',
      'api': 'API 定义目录',
      'web': 'Web 应用相关代码目录',
      'models': '数据模型目录',
      'services': '业务逻辑服务目录',
      'handlers': '请求处理器目录',
      'middleware': '中间件目录',
      'config': '配置文件目录',
      'docs': '文档目录，包含项目文档和说明',
      'examples': '示例代码目录，包含使用示例',
      'scripts': '脚本目录，包含构建、部署等脚本',
      'test': '测试文件目录，包含单元测试和集成测试',
      'tests': '测试文件目录，包含单元测试和集成测试',
      'vendor': '第三方依赖库目录',
      'bin': '可执行文件目录，包含编译后的二进制文件',
      'build': '构建输出目录',
    };
  }

  async detectProjectTypes(projectRoot: string): Promise<ProjectTypeDetection> {
    const types: string[] = ['go'];
    const frameworks: string[] = [];

    const goModPath = resolve(projectRoot, 'go.mod');
    if (existsSync(goModPath)) {
      try {
        const content = readFileSync(goModPath, 'utf-8');
        if (content.includes('github.com/gin-gonic/gin')) frameworks.push('gin');
        if (content.includes('github.com/labstack/echo')) frameworks.push('echo');
        if (content.includes('github.com/gofiber/fiber')) frameworks.push('fiber');
        if (content.includes('gorm.io/gorm')) frameworks.push('gorm');
        if (content.includes('google.golang.org/grpc')) frameworks.push('grpc');
        if (content.includes('github.com/micro/micro')) frameworks.push('micro');
      } catch {
        // 忽略解析错误
      }
    }

    return { types, frameworks };
  }

  async detectVersions(projectRoot: string): Promise<VersionInfo> {
    const versions: VersionInfo = {};

    const goModPath = resolve(projectRoot, 'go.mod');
    if (existsSync(goModPath)) {
      try {
        const goModContent = readFileSync(goModPath, 'utf-8');
        const goVersionMatch = goModContent.match(/^go\s+(\d+\.\d+)/m);
        if (goVersionMatch) {
          versions['Go'] = goVersionMatch[1];
        }
      } catch {
        // 忽略解析错误
      }
    }

    return versions;
  }

  async findEntryPoints(files: string[], projectRoot: string): Promise<string[]> {
    return this.findEntryPointsByConfig(files, projectRoot, {
      commonEntries: [
        'main.go',
        'cmd/main.go',
        'cmd/app/main.go',
        'cmd/server/main.go',
        'cmd/cli/main.go',
        'src/main.go',
      ],
      contentChecks: [
        {
          pattern: /func main\(\)/,
          filter: (file: string) => file.endsWith('.go')
        }
      ]
    });
  }

  async detectCodeStandards(projectRoot: string): Promise<string[]> {
    const standardFiles = {
      'GoFmt': ['.gofmt'],
      'GoLint': ['.golint'],
      'GolangCI-Lint': ['.golangci.yml', '.golangci.yaml', '.golangci.toml'],
      'GoVet': [],
      'EditorConfig': ['.editorconfig'],
    };

    return this.detectCodeStandardsByFiles(projectRoot, standardFiles);
  }

  getCommonSourceExtensions(): string[] {
    return ['.go'];
  }

  getCommonTestExtensions(): string[] {
    return ['_test.go'];
  }

  getCommonConfigFiles(): string[] {
    return [
      'go.mod',
      'go.sum',
      '.golangci.yml',
      '.golangci.yaml',
      '.golangci.toml',
      '.golint',
      '.editorconfig',
      'Makefile',
      'go.work',
    ];
  }

  getComplexityConfig(): ComplexityConfig {
    return {
      functionPatterns: [
        /\bfunc\s+\w+/g,
        /\bfunc\s+\([^)]+\)\s+\w+/g,
      ],
      branchPattern: /\b(if|else if|case|for|select|&&|\|\|)\b/g,
      nestingStrategy: 'braces',
    };
  }

  getImportResolveConfig(): ImportResolveConfig {
    return {
      resolveExtensions: ['.go'],
      indexFiles: [],
      importPatterns: [
        /import\s+"([^"]+)"/g,
        /import\s+\(\s*([\s\S]*?)\s*\)/g,
      ],
    };
  }

  getExcludeDirs(): string[] {
    return ['vendor', 'bin', 'build', 'testdata'];
  }
}
