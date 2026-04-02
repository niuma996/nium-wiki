/**
 * Python 语言处理模块
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { BaseLanguageHandler, VersionInfo, ProjectTypeDetection, DocEntry, ComplexityConfig, ImportResolveConfig } from './base';

export class PythonHandler extends BaseLanguageHandler {
  /**
   * 获取语言名称
   */
  getLanguageName(): string {
    return 'Python';
  }

  /**
   * 获取语言标识符
   */
  getLanguageId(): string {
    return 'python';
  }

  /**
   * 获取语言别名
   */
  getAliases(): string[] {
    return ['py', 'python3'];
  }

  /**
   * 获取项目指示器
   */
  getProjectIndicators(): string[] {
    return ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile', 'setup.cfg', 'poetry.lock', '.python-version'];
  }

  /**
   * 获取目录描述
   */
  getDirectoryDescriptions(): Record<string, string> {
    return {
      ...this.getCommonDirectoryDescriptions(),
      'src': '源代码目录，包含主要的 Python 代码',
      'app': '应用程序代码目录',
      'main': '主程序代码目录',
      'lib': '库文件目录',
      'libs': '库文件目录',
      'tests': '测试文件目录，包含单元测试和集成测试',
      'test': '测试文件目录，包含单元测试和集成测试',
      '__pycache__': 'Python 编译缓存目录',
      'venv': '虚拟环境目录',
      '.venv': '虚拟环境目录',
      'env': '环境变量配置目录',
      'config': '配置文件目录',
      'data': '数据文件目录',
      'docs': '文档目录，包含项目文档和说明',
      'examples': '示例代码目录，包含使用示例',
      'scripts': '脚本目录，包含构建、部署等脚本',
      'bin': '可执行文件目录，包含 CLI 命令脚本',
      'build': '构建输出目录',
      'dist': '打包输出目录，包含发布的包文件',
      'requirements': '依赖管理目录',
    };
  }

  /**
   * 检测项目类型
   */
  async detectProjectTypes(projectRoot: string): Promise<ProjectTypeDetection> {
    const types: string[] = ['python'];
    const packageManager: string[] = [];
    const frameworks: string[] = [];

    // 包管理器检测
    if (existsSync(resolve(projectRoot, 'poetry.lock'))) packageManager.push('poetry');
    if (existsSync(resolve(projectRoot, 'Pipfile.lock'))) packageManager.push('pipenv');
    if (existsSync(resolve(projectRoot, 'requirements.txt'))) packageManager.push('pip');
    if (existsSync(resolve(projectRoot, 'setup.py'))) packageManager.push('setuptools');

    // 从 pyproject.toml 检测框架和工具
    const pyprojectPath = resolve(projectRoot, 'pyproject.toml');
    if (existsSync(pyprojectPath)) {
      try {
        const content = readFileSync(pyprojectPath, 'utf-8');

        // 检测工具
        if (content.includes('poetry')) packageManager.push('poetry');
        if (content.includes('pdm')) packageManager.push('pdm');
        if (content.includes('flit')) packageManager.push('flit');
        if (content.includes('hatch')) packageManager.push('hatch');

        // 检测框架
        if (content.includes('fastapi') || content.includes('starlette')) frameworks.push('fastapi');
        if (content.includes('django')) frameworks.push('django');
        if (content.includes('flask')) frameworks.push('flask');
        if (content.includes('tornado')) frameworks.push('tornado');
        if (content.includes('aiohttp')) frameworks.push('aiohttp');
        if (content.includes('pydantic')) frameworks.push('pydantic');
        if (content.includes('celery')) frameworks.push('celery');
        if (content.includes('pytest-asyncio')) types.push('async');

      } catch {
        // 忽略解析错误
      }
    }

    // 从 requirements.txt 检测框架
    const requirementsPath = resolve(projectRoot, 'requirements.txt');
    if (existsSync(requirementsPath)) {
      try {
        const content = readFileSync(requirementsPath, 'utf-8').toLowerCase();
        if (content.includes('django')) frameworks.push('django');
        if (content.includes('flask')) frameworks.push('flask');
        if (content.includes('fastapi')) frameworks.push('fastapi');
        if (content.includes('celery')) frameworks.push('celery');
        if (content.includes('pytest')) types.push('pytest');
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

    // 检查 .python-version 文件
    const pythonVersionPath = resolve(projectRoot, '.python-version');
    if (existsSync(pythonVersionPath)) {
      try {
        const versionContent = readFileSync(pythonVersionPath, 'utf-8');
        versions['Python'] = versionContent.trim();
      } catch {
        // 忽略文件读取错误
      }
    }

    // 检查 pyproject.toml
    const pyprojectPath = resolve(projectRoot, 'pyproject.toml');
    if (existsSync(pyprojectPath)) {
      try {
        const pyprojectContent = readFileSync(pyprojectPath, 'utf-8');
        const pythonVersionMatch = pyprojectContent.match(/python\s*=\s*['"]([^'"]+)['"]/);
        if (pythonVersionMatch) {
          versions['Python'] = pythonVersionMatch[1];
        }
      } catch {
        // 忽略解析错误
      }
    }

    // 检查 setup.py
    const setupPyPath = resolve(projectRoot, 'setup.py');
    if (existsSync(setupPyPath)) {
      try {
        const setupContent = readFileSync(setupPyPath, 'utf-8');
        const pythonVersionMatch = setupContent.match(/python_requires\s*=\s*['"]([^'"]+)['"]/);
        if (pythonVersionMatch) {
          versions['Python'] = pythonVersionMatch[1];
        }
      } catch {
        // 忽略解析错误
      }
    }

    return versions;
  }

  async detectProjectVersion(projectRoot: string): Promise<string | null> {
    const pyprojectPath = resolve(projectRoot, 'pyproject.toml');
    if (existsSync(pyprojectPath)) {
      try {
        const content = readFileSync(pyprojectPath, 'utf-8');
        // [project] version = "1.2.3"
        let m = content.match(/^\[project\]\s*\n[^]*?version\s*=\s*["']([^"']+)["']/m);
        if (m) return m[1];
        // [tool.poetry] version = "1.2.3"
        m = content.match(/^\[tool\.poetry\]\s*\n[^]*?version\s*=\s*["']([^"']+)["']/m);
        if (m) return m[1];
      } catch { /* ignore */ }
    }
    // setup.py: version = "1.2.3"
    const setupPyPath = resolve(projectRoot, 'setup.py');
    if (existsSync(setupPyPath)) {
      try {
        const content = readFileSync(setupPyPath, 'utf-8');
        const m = content.match(/version\s*=\s*["']([^"']+)["']/);
        if (m) return m[1];
      } catch { /* ignore */ }
    }
    return null;
  }

  /**
   * 查找入口文件
   */
  async findEntryPoints(files: string[], projectRoot: string): Promise<string[]> {
    return this.findEntryPointsByConfig(files, projectRoot, {
      commonEntries: [
        'main.py',
        '__main__.py',
        'app.py',
        'run.py',
        'manage.py',
        'server.py',
        'cli.py',
        'setup.py',
        'wsgi.py',
        'asgi.py',
        'src/main.py',
        'src/__main__.py',
        'src/app.py',
      ],
      configFileChecks: [
        {
          filePath: 'setup.py',
          parseFn: (content, files) => {
            const entryPoints: string[] = [];
            const entryPointMatch = content.match(/entry_points\s*=\s*\{[^}]+\}/s);
            if (entryPointMatch) {
              const entryPointContent = entryPointMatch[0];
              const consoleScriptsMatch = entryPointContent.match(/console_scripts\s*:\s*\[([^\]]+)\]/s);
              if (consoleScriptsMatch) {
                const scripts = consoleScriptsMatch[1];
                const scriptMatches = scripts.match(/([^=]+)\s*=\s*([^,]+)/g);
                if (scriptMatches) {
                  scriptMatches.forEach(scriptMatch => {
                    const [name, modulePath] = scriptMatch.split('=').map(s => s.trim());
                    const filePath = modulePath.replace(/\./g, '/').replace(':', '/') + '.py';
                    entryPoints.push(filePath);
                  });
                }
              }
            }
            return entryPoints;
          }
        },
        {
          filePath: 'pyproject.toml',
          parseFn: (content, files) => {
            const entryPoints: string[] = [];
            // 检查 [project.scripts] 或 [tool.poetry.scripts]
            const scriptsMatch = content.match(/\[(project\.scripts|tool\.poetry\.scripts)\]\s*\n([\s\S]*?)(?=\n\[|\n*$)/);
            if (scriptsMatch) {
              const scriptsContent = scriptsMatch[2];
              const scriptMatches = scriptsContent.match(/^(\w+)\s*=\s*["']([^"']+)["']$/gm);
              if (scriptMatches) {
                scriptMatches.forEach(scriptMatch => {
                  const [name, modulePath] = scriptMatch.split('=').map(s => s.trim());
                  const filePath = modulePath.replace(/\./g, '/').replace(':', '/') + '.py';
                  entryPoints.push(filePath);
                });
              }
            }
            return entryPoints;
          }
        }
      ],
      contentChecks: [
        {
          pattern: /if __name__\s*==\s*['"']__main__['"']:/,
          filter: (file: string) => file.endsWith('.py')
        }
      ]
    });
  }

  /**
   * 检测代码规范
   */
  async detectCodeStandards(projectRoot: string): Promise<string[]> {
    const standardFiles = {
      'Black': {
        files: ['pyproject.toml', 'setup.cfg'],
        contentCheck: (content: string) => content.includes('[tool.black]') || content.includes('[black]')
      },
      'Pylint': ['.pylintrc', 'pylintrc', 'setup.cfg', 'pyproject.toml'],
      'Flake8': ['.flake8', 'flake8.cfg', 'setup.cfg', 'tox.ini', 'pyproject.toml'],
      'Mypy': ['mypy.ini', '.mypy.ini', 'setup.cfg', 'pyproject.toml'],
      'isort': ['.isort.cfg', 'setup.cfg', 'pyproject.toml', '.editorconfig'],
      'Bandit': ['.bandit', 'bandit.yml'],
      'Pytest': ['pytest.ini', 'setup.cfg', 'pyproject.toml', 'conftest.py'],
      'EditorConfig': ['.editorconfig'],
      'Ruff': ['pyproject.toml'],
    };

    return this.detectCodeStandardsByFiles(projectRoot, standardFiles);
  }

  /**
   * 获取常见源代码扩展名
   */
  getCommonSourceExtensions(): string[] {
    return [
      '.py',
      '.pyi',
    ];
  }

  /**
   * 获取常见测试文件扩展名
   */
  getCommonTestExtensions(): string[] {
    return [
      '.test.py',
      '.spec.py',
      '_test.py',
      'test_*.py',
      '*_test.py',
      'conftest.py',
    ];
  }

  /**
   * 获取常见配置文件
   */
  getCommonConfigFiles(): string[] {
    return [
      'pyproject.toml',
      'setup.py',
      'setup.cfg',
      'requirements.txt',
      'requirements-dev.txt',
      'requirements-dev.in',
      'Pipfile',
      'Pipfile.lock',
      'poetry.lock',
      '.python-version',
      'poetry.lock',
      '.pylintrc',
      'pylintrc',
      '.flake8',
      'flake8.cfg',
      'mypy.ini',
      '.mypy.ini',
      '.isort.cfg',
      'pytest.ini',
      'conftest.py',
      'tox.ini',
      '.editorconfig',
      '.bandit',
      'bandit.yml',
      'MANIFEST.in',
    ];
  }

  /**
   * 提取 Python DocString 注释
   */
  extractDocs(content: string, filePath: string): DocEntry[] {
    const entries: DocEntry[] = [];
    const defPattern = /(?:^|\n)((?:async\s+)?def|class)\s+(\w+)[^:]*:\s*(?:\n\s+)?(?:"""([\s\S]*?)"""|'''([\s\S]*?)''')/g;

    let match: RegExpExecArray | null;
    while ((match = defPattern.exec(content)) !== null) {
      const defType: DocEntry['type'] = match[1].includes('def') ? 'function' : 'class';
      const name = match[2];
      const docstring = match[3] || match[4] || '';
      const lineNumber = content.substring(0, match.index).split('\n').length;

      const descriptionLines: string[] = [];
      const params: Array<{ name: string; type: string; description: string }> = [];
      let returns: string | null = null;
      const examples: string[] = [];

      let currentSection = 'description';

      for (const line of docstring.split('\n')) {
        const stripped = line.trim();

        if (['Args:', 'Arguments:', 'Parameters:', 'Params:'].includes(stripped)) {
          currentSection = 'params';
          continue;
        } else if (['Returns:', 'Return:', 'Yields:'].includes(stripped)) {
          currentSection = 'returns';
          continue;
        } else if (['Example:', 'Examples:', 'Usage:'].includes(stripped)) {
          currentSection = 'examples';
          continue;
        } else if (stripped.endsWith(':') && !stripped.slice(0, -1).includes(':')) {
          currentSection = 'other';
          continue;
        }

        if (currentSection === 'description') {
          descriptionLines.push(stripped);
        } else if (currentSection === 'params') {
          const paramMatch = stripped.match(/(\w+)\s*(?:\(([^)]+)\))?\s*:\s*(.*)/);
          if (paramMatch) {
            params.push({
              name: paramMatch[1],
              type: paramMatch[2] || 'Any',
              description: paramMatch[3],
            });
          }
        } else if (currentSection === 'returns') {
          returns = stripped;
        } else if (currentSection === 'examples') {
          examples.push(stripped);
        }
      }

      entries.push({
        name,
        type: defType,
        description: descriptionLines.join(' ').trim(),
        params,
        returns,
        examples,
        lineNumber: lineNumber,
        filePath: filePath,
      });
    }

    return entries;
  }

  getComplexityConfig(): ComplexityConfig {
    return {
      functionPatterns: [
        /\bdef\s+\w+/g,
        /\basync\s+def\s+\w+/g,
        /\bclass\s+\w+/g,
      ],
      branchPattern: /\b(if|elif|for|while|except|and|or)\b/g,
      nestingStrategy: 'indentation',
    };
  }

  getImportResolveConfig(): ImportResolveConfig {
    return {
      resolveExtensions: ['.py', '.pyi'],
      indexFiles: ['__init__.py'],
      importPatterns: [
        /^\s*from\s+(\.[^\s]+)\s+import/gm,
        /^\s*import\s+(\.[^\s,]+)/gm,
      ],
      cleanSpecifier: (specifier: string) => specifier.replace(/\./g, '/'),
    };
  }

  getExcludeDirs(): string[] {
    return ['__pycache__', 'venv', '.venv', 'env', '.env', 'eggs', '.eggs', '.tox', '.mypy_cache', '.pytest_cache', '.ruff_cache', 'htmlcov', '.nox'];
  }

  hasFrontendLayer(projectTypes: string[]): boolean {
    return projectTypes.some(t => ['django', 'flask'].includes(t));
  }
}
