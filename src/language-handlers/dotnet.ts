/**
 * .NET 语言处理模块
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { BaseLanguageHandler, VersionInfo, ProjectTypeDetection, ComplexityConfig, ImportResolveConfig } from './base';

export class DotNetHandler extends BaseLanguageHandler {
  getLanguageName(): string {
    return '.NET';
  }

  getLanguageId(): string {
    return 'dotnet';
  }

  getAliases(): string[] {
    return ['csharp', 'c#', 'vbnet', 'vb.net', 'fsharp', 'f#', 'aspnet', 'asp.net'];
  }

  getProjectIndicators(): string[] {
    return ['*.csproj', '*.fsproj', '*.vbproj', '*.sln', 'project.json', 'global.json'];
  }

  getDirectoryDescriptions(): Record<string, string> {
    return {
      ...this.getCommonDirectoryDescriptions(),
      'src': '源代码目录',
      'Source': '源代码目录（经典结构）',
      'tests': '测试目录',
      'Tests': '测试目录（经典结构）',
      'test': '测试目录',
      'Controllers': '控制器目录（ASP.NET MVC）',
      'Models': '模型目录（ASP.NET MVC）',
      'Views': '视图目录（ASP.NET MVC）',
      'Pages': '页面目录（ASP.NET Core Razor Pages）',
      'wwwroot': 'Web 静态资源目录（ASP.NET Core）',
      'Properties': '属性目录',
      'bin': '编译输出目录',
      'obj': '中间编译目录',
      'config': '配置文件目录',
      'Configuration': '配置目录',
      'Services': '服务目录',
      'Repositories': '仓储目录',
      'Data': '数据访问目录',
      'Migrations': '数据库迁移目录（Entity Framework）',
    };
  }

  async detectProjectTypes(projectRoot: string): Promise<ProjectTypeDetection> {
    const types: string[] = ['dotnet'];
    const frameworks: string[] = [];

    // 检查项目文件以确定框架
    const projectFiles = [
      '*.csproj', '*.fsproj', '*.vbproj'
    ];

    for (const pattern of projectFiles) {
      try {
        const files = require('fs').readdirSync(projectRoot);
        const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
        const matchingFiles = files.filter((f: string) => regex.test(f));

        for (const file of matchingFiles) {
          const filePath = resolve(projectRoot, file);
          try {
            const content = readFileSync(filePath, 'utf-8').toLowerCase();
            if (content.includes('microsoft.aspnetcore')) frameworks.push('asp.net-core');
            if (content.includes('microsoft.entityframeworkcore')) frameworks.push('entity-framework-core');
            if (content.includes('microsoft.net.sdk.web')) frameworks.push('asp.net-core-web');
            if (content.includes('microsoft.net.sdk.blazor')) frameworks.push('blazor');
            if (content.includes('microsoft.net.sdk.worker')) frameworks.push('worker-service');
            if (content.includes('microsoft.net.sdk.maui')) frameworks.push('maui');
            if (content.includes('microsoft.net.sdk.winui')) frameworks.push('winui');
            if (content.includes('microsoft.net.sdk.wpf')) frameworks.push('wpf');
          } catch {
            // 忽略文件读取错误
          }
        }
      } catch {
        // 忽略目录读取错误
      }
    }

    // 检查 global.json 获取 SDK 版本
    const globalJsonPath = resolve(projectRoot, 'global.json');
    if (existsSync(globalJsonPath)) {
      try {
        const content = readFileSync(globalJsonPath, 'utf-8');
        const sdkMatch = content.match(/"sdk"\s*:\s*{\s*"version"\s*:\s*"([^"]+)"/);
        if (sdkMatch) {
          // 可以存储版本信息
        }
      } catch {
        // 忽略解析错误
      }
    }

    return { types, frameworks };
  }

  async detectVersions(projectRoot: string): Promise<VersionInfo> {
    const versions: VersionInfo = {};

    // 从 global.json 读取 SDK 版本
    const globalJsonPath = resolve(projectRoot, 'global.json');
    if (existsSync(globalJsonPath)) {
      try {
        const content = readFileSync(globalJsonPath, 'utf-8');
        const sdkMatch = content.match(/"sdk"\s*:\s*{\s*"version"\s*:\s*"([^"]+)"/);
        if (sdkMatch) {
          versions['.NET SDK'] = sdkMatch[1];
        }
      } catch {
        // 忽略解析错误
      }
    }

    // 从项目文件读取目标框架版本
    const projectFiles = ['*.csproj', '*.fsproj', '*.vbproj'];
    for (const pattern of projectFiles) {
      try {
        const files = require('fs').readdirSync(projectRoot);
        const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
        const matchingFiles = files.filter((f: string) => regex.test(f));

        for (const file of matchingFiles) {
          const filePath = resolve(projectRoot, file);
          try {
            const content = readFileSync(filePath, 'utf-8');
            const targetFrameworkMatch = content.match(/<TargetFramework>([^<]+)<\/TargetFramework>/);
            if (targetFrameworkMatch) {
              versions['TargetFramework'] = targetFrameworkMatch[1];
              break;
            }
            const targetFrameworksMatch = content.match(/<TargetFrameworks>([^<]+)<\/TargetFrameworks>/);
            if (targetFrameworksMatch) {
              versions['TargetFrameworks'] = targetFrameworksMatch[1];
              break;
            }
          } catch {
            // 忽略文件读取错误
          }
        }
        if (versions['TargetFramework'] || versions['TargetFrameworks']) {
          break;
        }
      } catch {
        // 忽略目录读取错误
      }
    }

    return versions;
  }

  async findEntryPoints(files: string[], projectRoot: string): Promise<string[]> {
    return this.findEntryPointsByConfig(files, projectRoot, {
      commonEntries: [
        'Program.cs',
        'Program.fs',
        'Program.vb',
        'Startup.cs',
        'Main.cs',
        'src/Program.cs',
      ],
      contentChecks: [
        {
          pattern: /\.Run\(\)|\.Build\(\)\.Run\(\)|new WebHostBuilder/,
          filter: (file: string) => file.endsWith('.cs') || file.endsWith('.fs') || file.endsWith('.vb')
        }
      ]
    });
  }

  async detectCodeStandards(projectRoot: string): Promise<string[]> {
    const standardFiles = {
      'EditorConfig': ['.editorconfig'],
      'StyleCop': ['stylecop.json'],
      'Roslynator': ['roslynator.config.json'],
      'dotnet format': ['.formatconfig'],
      'xUnit': [],
      'NUnit': [],
      'MSTest': [],
    };

    return this.detectCodeStandardsByFiles(projectRoot, standardFiles);
  }

  getCommonSourceExtensions(): string[] {
    return ['.cs', '.fs', '.vb', '.csx', '.fsx', '.vbx'];
  }

  getCommonTestExtensions(): string[] {
    return ['Tests.cs', 'Test.cs', 'Tests.fs', 'Test.fs', 'Tests.vb', 'Test.vb'];
  }

  getCommonConfigFiles(): string[] {
    return [
      '*.csproj',
      '*.fsproj',
      '*.vbproj',
      '*.sln',
      'global.json',
      'appsettings.json',
      'appsettings.*.json',
      'launchSettings.json',
      'project.json',
      'package.json',
      '.editorconfig',
      'stylecop.json',
      'roslynator.config.json',
      '.formatconfig',
      'Directory.Build.props',
      'Directory.Build.targets',
    ];
  }

  getComplexityConfig(): ComplexityConfig {
    return {
      functionPatterns: [
        /\b(public|private|protected|internal|static|async|virtual|override|abstract)[\s\w<>,\[\]]*\s+\w+\s*\(/g,
      ],
      branchPattern: /\b(if|else if|case|for|foreach|while|catch|&&|\|\||\?)\b/g,
      nestingStrategy: 'braces',
    };
  }

  getImportResolveConfig(): ImportResolveConfig {
    return {
      resolveExtensions: ['.cs', '.fs', '.vb'],
      indexFiles: [],
      importPatterns: [
        /^\s*using\s+([\w.]+)/gm,
      ],
    };
  }

  getExcludeDirs(): string[] {
    return ['bin', 'obj', 'packages', 'TestResults', '.vs'];
  }

  hasFrontendLayer(projectTypes: string[]): boolean {
    return projectTypes.some(t => ['blazor', 'asp.net-core-web'].includes(t));
  }
}
