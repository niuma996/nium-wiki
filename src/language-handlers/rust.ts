/**
 * Rust 语言处理模块
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { BaseLanguageHandler, VersionInfo, ProjectTypeDetection, ComplexityConfig, ImportResolveConfig } from './base';

export class RustHandler extends BaseLanguageHandler {
  getLanguageName(): string {
    return 'Rust';
  }

  getLanguageId(): string {
    return 'rust';
  }

  getAliases(): string[] {
    return ['rs', 'rust-lang'];
  }

  getProjectIndicators(): string[] {
    return ['Cargo.toml', 'Cargo.lock'];
  }

  getDirectoryDescriptions(): Record<string, string> {
    return {
      ...this.getCommonDirectoryDescriptions(),
      'src': '源代码目录',
      'tests': '集成测试目录',
      'benches': '性能测试目录',
      'examples': '示例代码目录',
      'docs': '文档目录',
      'target': '构建输出目录',
      'config': '配置文件目录',
      'scripts': '脚本目录',
    };
  }

  async detectProjectTypes(projectRoot: string): Promise<ProjectTypeDetection> {
    const types: string[] = ['rust'];
    const frameworks: string[] = [];

    const cargoPath = resolve(projectRoot, 'Cargo.toml');
    if (existsSync(cargoPath)) {
      try {
        const content = readFileSync(cargoPath, 'utf-8');
        if (content.includes('actix-web')) frameworks.push('actix-web');
        if (content.includes('axum')) frameworks.push('axum');
        if (content.includes('tokio')) frameworks.push('tokio');
        if (content.includes('tauri')) frameworks.push('tauri');
        if (content.includes('rocket')) frameworks.push('rocket');
        if (content.includes('warp')) frameworks.push('warp');
      } catch {
        // 忽略解析错误
      }
    }

    return { types, frameworks };
  }

  async detectVersions(projectRoot: string): Promise<VersionInfo> {
    const versions: VersionInfo = {};

    const cargoPath = resolve(projectRoot, 'Cargo.toml');
    if (existsSync(cargoPath)) {
      try {
        const content = readFileSync(cargoPath, 'utf-8');
        const rustVersionMatch = content.match(/rust-version\s*=\s*"([^"]+)"/);
        if (rustVersionMatch) {
          versions['Rust'] = rustVersionMatch[1];
        }
      } catch {
        // 忽略解析错误
      }
    }

    return versions;
  }

  async detectProjectVersion(projectRoot: string): Promise<string | null> {
    const cargoPath = resolve(projectRoot, 'Cargo.toml');
    if (!existsSync(cargoPath)) return null;
    try {
      const content = readFileSync(cargoPath, 'utf-8');
      // [package] / [lib] version = "1.2.3"
      const m = content.match(/^\[package\]\s*\n[^]*?version\s*=\s*"([^"]+)"/m)
        || content.match(/version\s*=\s*"([^"]+)"/);
      return m ? m[1] : null;
    } catch {
      return null;
    }
  }

  async findEntryPoints(files: string[], projectRoot: string): Promise<string[]> {
    return this.findEntryPointsByConfig(files, projectRoot, {
      commonEntries: [
        'src/main.rs',
        'src/lib.rs',
        'main.rs',
        'lib.rs',
      ],
      contentChecks: [
        {
          pattern: /fn main\(\)/,
          filter: (file: string) => file.endsWith('.rs')
        }
      ]
    });
  }

  async detectCodeStandards(projectRoot: string): Promise<string[]> {
    const standardFiles = {
      'RustFmt': ['rustfmt.toml', '.rustfmt.toml'],
      'Clippy': ['clippy.toml', '.clippy.toml'],
      'EditorConfig': ['.editorconfig'],
    };

    return this.detectCodeStandardsByFiles(projectRoot, standardFiles);
  }

  getCommonSourceExtensions(): string[] {
    return ['.rs'];
  }

  getCommonTestExtensions(): string[] {
    return ['_test.rs', 'test*.rs'];
  }

  getCommonConfigFiles(): string[] {
    return [
      'Cargo.toml',
      'Cargo.lock',
      'rustfmt.toml',
      '.rustfmt.toml',
      'clippy.toml',
      '.clippy.toml',
      '.editorconfig',
      'rust-toolchain.toml',
    ];
  }

  getComplexityConfig(): ComplexityConfig {
    return {
      functionPatterns: [
        /\bfn\s+\w+/g,
        /\basync\s+fn\s+\w+/g,
        /\bimpl\s+\w+/g,
      ],
      branchPattern: /\b(if|else if|match|for|while|loop|&&|\|\||\?)\b/g,
      nestingStrategy: 'braces',
    };
  }

  getImportResolveConfig(): ImportResolveConfig {
    return {
      resolveExtensions: ['.rs'],
      indexFiles: ['mod.rs', 'lib.rs'],
      importPatterns: [
        /\buse\s+(crate|super|self)::[^;]+/g,
        /\bmod\s+\w+/g,
      ],
    };
  }

  getExcludeDirs(): string[] {
    return ['target'];
  }
}
