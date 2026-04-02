/**
 * PHP 语言处理模块
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { BaseLanguageHandler, VersionInfo, ProjectTypeDetection, ComplexityConfig, ImportResolveConfig } from './base';

export class PhpHandler extends BaseLanguageHandler {
  getLanguageName(): string {
    return 'PHP';
  }

  getLanguageId(): string {
    return 'php';
  }

  getAliases(): string[] {
    return [];
  }

  getProjectIndicators(): string[] {
    return ['composer.json', 'composer.lock'];
  }

  getDirectoryDescriptions(): Record<string, string> {
    return {
      ...this.getCommonDirectoryDescriptions(),
      'src': '源代码目录',
      'app': '应用程序代码目录（Laravel/Symfony）',
      'config': '配置文件目录',
      'public': '公共访问目录',
      'tests': '测试目录',
      'test': '测试目录',
      'vendor': 'Composer 依赖目录',
      'database': '数据库目录（Laravel）',
      'routes': '路由目录（Laravel）',
      'resources': '资源目录（Laravel）',
      'views': '视图目录',
      'controllers': '控制器目录',
      'models': '模型目录',
      'middleware': '中间件目录',
      'storage': '存储目录（Laravel）',
      'bootstrap': '引导目录（Laravel）',
      'bin': '可执行文件目录',
    };
  }

  async detectProjectTypes(projectRoot: string): Promise<ProjectTypeDetection> {
    const types: string[] = ['php'];
    const packageManager: string[] = [];
    const frameworks: string[] = [];

    const composerPath = resolve(projectRoot, 'composer.json');
    if (existsSync(composerPath)) {
      packageManager.push('composer');
      try {
        const content = readFileSync(composerPath, 'utf-8').toLowerCase();
        if (content.includes('laravel')) frameworks.push('laravel');
        if (content.includes('symfony')) frameworks.push('symfony');
        if (content.includes('wordpress')) frameworks.push('wordpress');
        if (content.includes('yii')) frameworks.push('yii');
        if (content.includes('codeigniter')) frameworks.push('codeigniter');
        if (content.includes('slim')) frameworks.push('slim');
        if (content.includes('phpunit')) types.push('phpunit');
      } catch {
        // 忽略解析错误
      }
    }

    return { types, packageManager, frameworks };
  }

  async detectVersions(projectRoot: string): Promise<VersionInfo> {
    const versions: VersionInfo = {};

    const composerPath = resolve(projectRoot, 'composer.json');
    if (existsSync(composerPath)) {
      try {
        const content = readFileSync(composerPath, 'utf-8');
        const phpMatch = content.match(/"php"\s*:\s*"([^"]+)"/);
        if (phpMatch) {
          versions['PHP'] = phpMatch[1];
        }
      } catch {
        // 忽略解析错误
      }
    }

    return versions;
  }

  async detectProjectVersion(projectRoot: string): Promise<string | null> {
    const composerPath = resolve(projectRoot, 'composer.json');
    if (!existsSync(composerPath)) return null;
    try {
      const pkg = JSON.parse(readFileSync(composerPath, 'utf-8'));
      return pkg.version ?? null;
    } catch {
      return null;
    }
  }

  async findEntryPoints(files: string[], projectRoot: string): Promise<string[]> {
    return this.findEntryPointsByConfig(files, projectRoot, {
      commonEntries: [
        'index.php',
        'public/index.php',
        'app.php',
        'main.php',
        'run.php',
        'server.php',
        'artisan',
      ],
      contentChecks: [
        {
          pattern: /App::run|Application::run/,
          filter: (file: string) => file.endsWith('.php')
        }
      ]
    });
  }

  async detectCodeStandards(projectRoot: string): Promise<string[]> {
    const standardFiles = {
      'PHP CS Fixer': ['.php-cs-fixer.php', '.php-cs-fixer.dist.php', 'php-cs-fixer.php'],
      'PHP_CodeSniffer': ['phpunit.xml', 'phpunit.xml.dist', 'phpcs.xml', '.phpcs.xml', 'ruleset.xml'],
      'Psalm': ['psalm.xml', 'psalm.xml.dist'],
      'PHPStan': ['phpstan.neon', 'phpstan.neon.dist'],
      'EditorConfig': ['.editorconfig'],
      'PHPUnit': ['phpunit.xml', 'phpunit.xml.dist'],
    };

    return this.detectCodeStandardsByFiles(projectRoot, standardFiles);
  }

  getCommonSourceExtensions(): string[] {
    return ['.php', '.phtml'];
  }

  getCommonTestExtensions(): string[] {
    return ['Test.php', 'test.php', 'Tests.php'];
  }

  getCommonConfigFiles(): string[] {
    return [
      'composer.json',
      'composer.lock',
      '.php-cs-fixer.php',
      '.php-cs-fixer.dist.php',
      'php-cs-fixer.php',
      'phpunit.xml',
      'phpunit.xml.dist',
      'phpcs.xml',
      '.phpcs.xml',
      'ruleset.xml',
      'psalm.xml',
      'psalm.xml.dist',
      'phpstan.neon',
      'phpstan.neon.dist',
      '.editorconfig',
      '.env',
      '.env.example',
    ];
  }

  getComplexityConfig(): ComplexityConfig {
    return {
      functionPatterns: [
        /\bfunction\s+\w+/g,
        /\b(public|private|protected|static)\s+function\s+\w+/g,
        /\bclass\s+\w+/g,
      ],
      branchPattern: /\b(if|elseif|else if|case|for|foreach|while|catch|&&|\|\||\?)\b/g,
      nestingStrategy: 'braces',
    };
  }

  getImportResolveConfig(): ImportResolveConfig {
    return {
      resolveExtensions: ['.php'],
      indexFiles: [],
      importPatterns: [
        /\buse\s+([\w\\]+)/g,
        /\brequire(?:_once)?\s+['"]([^'"]+)['"]/g,
        /\binclude(?:_once)?\s+['"]([^'"]+)['"]/g,
      ],
    };
  }

  getExcludeDirs(): string[] {
    return ['vendor', 'storage', 'bootstrap/cache'];
  }

  hasFrontendLayer(projectTypes: string[]): boolean {
    return projectTypes.some(t => ['laravel', 'symfony'].includes(t));
  }
}
