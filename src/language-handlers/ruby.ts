/**
 * Ruby 语言处理模块
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { BaseLanguageHandler, VersionInfo, ProjectTypeDetection, ComplexityConfig, ImportResolveConfig } from './base.js';

export class RubyHandler extends BaseLanguageHandler {
  getLanguageName(): string {
    return 'Ruby';
  }

  getLanguageId(): string {
    return 'ruby';
  }

  getAliases(): string[] {
    return ['rb'];
  }

  getProjectIndicators(): string[] {
    return ['Gemfile', 'Rakefile', '*.gemspec'];
  }

  getDirectoryDescriptions(): Record<string, string> {
    return {
      ...this.getCommonDirectoryDescriptions(),
      'lib': '库代码目录',
      'app': '应用程序代码目录（Rails）',
      'spec': 'RSpec 测试目录',
      'test': '测试目录',
      'config': '配置文件目录',
      'db': '数据库目录（Rails）',
      'public': '公共资源目录（Rails）',
      'views': '视图目录（Rails）',
      'controllers': '控制器目录（Rails）',
      'models': '模型目录（Rails）',
      'helpers': '辅助方法目录（Rails）',
      'assets': '静态资源目录（Rails）',
      'scripts': '脚本目录',
      'bin': '可执行文件目录',
    };
  }

  async detectProjectTypes(projectRoot: string): Promise<ProjectTypeDetection> {
    const types: string[] = ['ruby'];
    const packageManager: string[] = [];
    const frameworks: string[] = [];

    if (existsSync(resolve(projectRoot, 'Gemfile'))) {
      packageManager.push('bundler');
      try {
        const content = readFileSync(resolve(projectRoot, 'Gemfile'), 'utf-8').toLowerCase();
        if (content.includes('rails')) frameworks.push('rails');
        if (content.includes('sinatra')) frameworks.push('sinatra');
        if (content.includes('grape')) frameworks.push('grape');
        if (content.includes('sidekiq')) frameworks.push('sidekiq');
        if (content.includes('rspec')) types.push('rspec');
        if (content.includes('minitest')) types.push('minitest');
      } catch {
        // 忽略解析错误
      }
    }

    return { types, packageManager, frameworks };
  }

  async detectVersions(projectRoot: string): Promise<VersionInfo> {
    const versions: VersionInfo = {};

    const rubyVersionPath = resolve(projectRoot, '.ruby-version');
    if (existsSync(rubyVersionPath)) {
      try {
        const versionContent = readFileSync(rubyVersionPath, 'utf-8');
        versions['Ruby'] = versionContent.trim();
      } catch {
        // 忽略文件读取错误
      }
    }

    const gemfilePath = resolve(projectRoot, 'Gemfile');
    if (existsSync(gemfilePath)) {
      try {
        const content = readFileSync(gemfilePath, 'utf-8');
        const rubyMatch = content.match(/ruby\s+['"]([^'"]+)['"]/);
        if (rubyMatch) {
          versions['Ruby'] = rubyMatch[1];
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
        'main.rb',
        'app.rb',
        'run.rb',
        'server.rb',
        'config.ru',
        'lib/main.rb',
      ],
      contentChecks: [
        {
          pattern: /\.(new|run|call|start)/,
          filter: (file: string) => file.endsWith('.rb') && file.includes('main')
        }
      ]
    });
  }

  async detectCodeStandards(projectRoot: string): Promise<string[]> {
    const standardFiles = {
      'Rubocop': ['.rubocop.yml', '.rubocop.yml', 'rubocop.yml'],
      'EditorConfig': ['.editorconfig'],
      'RSpec': ['spec/spec_helper.rb', '.rspec'],
      'Reek': ['.reek.yml', 'reek.yml'],
      'RuboCop RSpec': ['.rubocop-rspec.yml', '.rubocop-rspec.yaml'],
    };

    return this.detectCodeStandardsByFiles(projectRoot, standardFiles);
  }

  getCommonSourceExtensions(): string[] {
    return ['.rb'];
  }

  getCommonTestExtensions(): string[] {
    return ['_test.rb', '_spec.rb'];
  }

  getCommonConfigFiles(): string[] {
    return [
      'Gemfile',
      'Gemfile.lock',
      'Rakefile',
      '*.gemspec',
      '.ruby-version',
      '.ruby-gemset',
      'config.ru',
      '.rubocop.yml',
      '.rubocop.yaml',
      'rubocop.yml',
      '.rspec',
      'spec/spec_helper.rb',
      '.reek.yml',
      'reek.yml',
      '.editorconfig',
    ];
  }

  getComplexityConfig(): ComplexityConfig {
    return {
      functionPatterns: [
        /\bdef\s+\w+/g,
        /\bclass\s+\w+/g,
        /\bmodule\s+\w+/g,
      ],
      branchPattern: /\b(if|elsif|unless|case|when|for|while|until|rescue|&&|\|\|)\b/g,
      nestingStrategy: 'indentation',
    };
  }

  getImportResolveConfig(): ImportResolveConfig {
    return {
      resolveExtensions: ['.rb'],
      indexFiles: [],
      importPatterns: [
        /\brequire\s+['"]([^'"]+)['"]/g,
        /\brequire_relative\s+['"]([^'"]+)['"]/g,
      ],
    };
  }

  getExcludeDirs(): string[] {
    return ['vendor', 'tmp', 'log'];
  }

  hasFrontendLayer(projectTypes: string[]): boolean {
    return projectTypes.includes('rails');
  }
}
