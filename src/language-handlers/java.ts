/**
 * Java 语言处理模块
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { BaseLanguageHandler, VersionInfo, ProjectTypeDetection, ComplexityConfig, ImportResolveConfig } from './base';

export class JavaHandler extends BaseLanguageHandler {
  getLanguageName(): string {
    return 'Java';
  }

  getLanguageId(): string {
    return 'java';
  }

  getAliases(): string[] {
    return ['jdk', 'jvm', 'kotlin', 'scala'];
  }

  getProjectIndicators(): string[] {
    return ['pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle'];
  }

  getDirectoryDescriptions(): Record<string, string> {
    return {
      ...this.getCommonDirectoryDescriptions(),
      'src': '源代码根目录',
      'src/main/java': '主源代码目录，包含生产代码',
      'src/main/resources': '主资源目录，包含配置文件和静态资源',
      'src/test/java': '测试源代码目录，包含单元测试和集成测试',
      'src/test/resources': '测试资源目录，包含测试配置文件',
      'target': '构建输出目录，包含编译后的类文件和打包产物',
      'lib': '外部依赖库目录',
      'libs': '外部依赖库目录',
      'build': '构建脚本和配置目录',
      'gradle': 'Gradle 构建系统目录',
      'maven': 'Maven 构建系统目录',
      'docs': '文档目录，包含项目文档和说明',
      'examples': '示例代码目录，包含使用示例',
      'bin': '可执行文件目录，包含编译后的二进制文件',
      'config': '配置文件目录',
      'scripts': '脚本目录，包含构建、部署等脚本',
    };
  }

  async detectProjectTypes(projectRoot: string): Promise<ProjectTypeDetection> {
    const types: string[] = ['java'];
    const packageManager: string[] = [];
    const frameworks: string[] = [];

    if (existsSync(resolve(projectRoot, 'pom.xml'))) {
      packageManager.push('maven');
    }
    if (existsSync(resolve(projectRoot, 'build.gradle')) || existsSync(resolve(projectRoot, 'build.gradle.kts'))) {
      packageManager.push('gradle');
    }

    const pomPath = resolve(projectRoot, 'pom.xml');
    if (existsSync(pomPath)) {
      try {
        const content = readFileSync(pomPath, 'utf-8');
        if (content.includes('spring-boot')) frameworks.push('spring-boot');
        if (content.includes('springframework')) frameworks.push('spring');
      } catch {
        // 忽略解析错误
      }
    }

    const gradlePath = resolve(projectRoot, 'build.gradle');
    const gradleKtsPath = resolve(projectRoot, 'build.gradle.kts');
    if (existsSync(gradlePath)) {
      try {
        const content = readFileSync(gradlePath, 'utf-8');
        if (content.includes('org.springframework.boot')) frameworks.push('spring-boot');
      } catch {
        // 忽略解析错误
      }
    } else if (existsSync(gradleKtsPath)) {
      try {
        const content = readFileSync(gradleKtsPath, 'utf-8');
        if (content.includes('org.springframework.boot')) frameworks.push('spring-boot');
      } catch {
        // 忽略解析错误
      }
    }

    return { types, packageManager, frameworks };
  }

  async detectVersions(projectRoot: string): Promise<VersionInfo> {
    const versions: VersionInfo = {};

    // 检查 Maven 配置
    const pomPath = resolve(projectRoot, 'pom.xml');
    if (existsSync(pomPath)) {
      try {
        const pomContent = readFileSync(pomPath, 'utf-8');
        const javaVersionMatch =
          pomContent.match(/<java\.version>([^<]+)<\/java\.version>/) ||
          pomContent.match(/<maven\.compiler\.source>([^<]+)<\/maven\.compiler\.source>/);
        if (javaVersionMatch) {
          versions['Java'] = javaVersionMatch[1];
        }
      } catch {
        // 忽略解析错误
      }
    }

    // 检查 Gradle 配置
    const gradlePath = resolve(projectRoot, 'build.gradle');
    const gradleKtsPath = resolve(projectRoot, 'build.gradle.kts');

    if (existsSync(gradlePath)) {
      try {
        const gradleContent = readFileSync(gradlePath, 'utf-8');
        const javaVersionMatch =
          gradleContent.match(/sourceCompatibility\s*=\s*['"]?([^'"\\s]+)['"]?/) ||
          gradleContent.match(/targetCompatibility\s*=\s*['"]?([^'"\\s]+)['"]?/);
        if (javaVersionMatch) {
          versions['Java'] = javaVersionMatch[1];
        }
      } catch {
        // 忽略解析错误
      }
    } else if (existsSync(gradleKtsPath)) {
      try {
        const gradleContent = readFileSync(gradleKtsPath, 'utf-8');
        const javaVersionMatch =
          gradleContent.match(/sourceCompatibility\s*=\s*JavaVersion\.VERSION_(\d+_\d+)/) ||
          gradleContent.match(/targetCompatibility\s*=\s*JavaVersion\.VERSION_(\d+_\d+)/);
        if (javaVersionMatch) {
          versions['Java'] = javaVersionMatch[1].replace('_', '.');
        }
      } catch {
        // 忽略解析错误
      }
    }

    return versions;
  }

  async detectProjectVersion(projectRoot: string): Promise<string | null> {
    const pomPath = resolve(projectRoot, 'pom.xml');
    if (!existsSync(pomPath)) return null;
    try {
      const content = readFileSync(pomPath, 'utf-8');
      const m = content.match(/<project[^>]*>[\s\S]*?<version>([^<]+)<\/version>/);
      return m ? m[1] : null;
    } catch {
      return null;
    }
  }

  async findEntryPoints(files: string[], projectRoot: string): Promise<string[]> {
    return this.findEntryPointsByConfig(files, projectRoot, {
      commonEntries: [
        'src/main/java/**/Main.java',
        'src/main/java/**/Application.java',
        'src/main/java/**/App.java',
        'src/main/java/**/Bootstrap.java',
        'src/main/java/**/Launcher.java',
      ],
      contentChecks: [
        {
          pattern: /public static void main\(String\[\] args\)/,
          filter: (file: string) => file.endsWith('.java')
        }
      ]
    });
  }

  async detectCodeStandards(projectRoot: string): Promise<string[]> {
    const standardFiles = {
      'Checkstyle': ['checkstyle.xml', 'google_checks.xml', 'sun_checks.xml'],
      'PMD': ['pmd.xml', '.pmd'],
      'FindBugs': ['findbugs.xml', '.findbugs'],
      'SpotBugs': ['spotbugs.xml', '.spotbugs'],
      'SonarQube': ['sonar-project.properties'],
      'EditorConfig': ['.editorconfig'],
      'Maven': ['pom.xml'],
      'Gradle': ['build.gradle', 'build.gradle.kts'],
    };

    return this.detectCodeStandardsByFiles(projectRoot, standardFiles);
  }

  getCommonSourceExtensions(): string[] {
    return ['.java', '.kt', '.scala'];
  }

  getCommonTestExtensions(): string[] {
    return ['Test.java', 'Tests.java', 'Test.kt', 'Tests.kt'];
  }

  getCommonConfigFiles(): string[] {
    return [
      'pom.xml',
      'build.gradle',
      'build.gradle.kts',
      'settings.gradle',
      'settings.gradle.kts',
      'gradle.properties',
      'checkstyle.xml',
      'pmd.xml',
      'spotbugs.xml',
      'sonar-project.properties',
      '.editorconfig',
    ];
  }

  getComplexityConfig(): ComplexityConfig {
    return {
      functionPatterns: [
        /\b(public|private|protected|static|final|abstract|synchronized|native)[\s\w<>,\[\]]*\s+\w+\s*\(/g,
      ],
      branchPattern: /\b(if|else if|case|for|while|catch|&&|\|\||\?)\b/g,
      nestingStrategy: 'braces',
    };
  }

  getImportResolveConfig(): ImportResolveConfig {
    return {
      resolveExtensions: ['.java', '.kt', '.scala'],
      indexFiles: [],
      importPatterns: [
        /^\s*import\s+([\w.]+)/gm,
      ],
    };
  }

  getExcludeDirs(): string[] {
    return ['target', 'build', 'bin', 'obj', '.gradle', '.mvn', 'out'];
  }
}
