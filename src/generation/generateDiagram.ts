/**
 * Mermaid 图表生成模块
 * 根据项目结构生成架构图、依赖图、模块关系图
 */

import * as fs from 'fs';
import * as path from 'path';
import { languageHandlerManager } from '../language-handlers/index.js';

interface ModuleData {
  name: string;
  path?: string;
  files?: number;
  type?: string;
}

export interface StructureData {
  projectName?: string;
  projectType?: string[];
  entryPoints?: string[];
  modules?: ModuleData[];
  docs?: string[];
}

interface ClassData {
  name: string;
  properties?: string[];
  methods?: string[];
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '');
}

function safeLabel(label: string): string {
  return label.replace(/"/g, '&quot;');
}

export function generateArchitectureDiagram(structure: StructureData): string {
  const modules = structure.modules || [];
  const projectType = structure.projectType || [];

  const lines = ['```mermaid', 'flowchart TB'];

  // 前端层：通过语言处理器判断是否有前端层，而非硬编码语言
  const detectedLanguages = languageHandlerManager.getSupportedLanguageIds().filter(id => {
    const handler = languageHandlerManager.getHandler(id);
    return handler && projectType.some(t => handler.getAliases().includes(t) || handler.getLanguageId() === t);
  });
  const hasFrontend = languageHandlerManager.hasFrontendLayer(detectedLanguages, projectType);

  if (hasFrontend) {
    lines.push('    subgraph Frontend["前端层"]');
    const frontendModules = modules.filter(m =>
      ['components', 'pages', 'views', 'ui', 'templates'].some(p => (m.path || '').includes(p)),
    );
    for (const m of frontendModules.slice(0, 5)) {
      lines.push(`        ${safeName(m.name)}["${safeLabel(m.name)}"]`);
    }
    if (!frontendModules.length) {
      lines.push('        UI["用户界面"]');
    }
    lines.push('    end');
    lines.push('');
  }

  // 核心层
  lines.push('    subgraph Core["核心层"]');
  const coreModules = modules.filter(m => {
    const p = m.path || '';
    return ['core', 'lib', 'services', 'api', 'src'].some(k => p.includes(k))
      && !['components', 'pages', 'views', 'ui', 'utils'].some(k => p.includes(k));
  });
  for (const m of coreModules.slice(0, 5)) {
    lines.push(`        ${safeName(m.name)}["${safeLabel(m.name)}"]`);
  }
  if (!coreModules.length) {
    lines.push('        Logic["业务逻辑"]');
  }
  lines.push('    end');
  lines.push('');

  // 工具层
  lines.push('    subgraph Utils["工具层"]');
  const utilModules = modules.filter(m =>
    ['utils', 'helpers', 'common', 'shared'].some(p => (m.path || '').includes(p)),
  );
  for (const m of utilModules.slice(0, 3)) {
    lines.push(`        ${safeName(m.name)}["${safeLabel(m.name)}"]`);
  }
  if (!utilModules.length) {
    lines.push('        Utilities["工具函数"]');
  }
  lines.push('    end');
  lines.push('');

  // 连接
  lines.push('    Frontend --> Core');
  lines.push('    Core --> Utils');

  lines.push('```');
  return lines.join('\n');
}

export function generateModuleDependencyDiagram(
  moduleName: string,
  dependencies: { internal?: string[]; external?: string[] },
): string {
  const lines = ['```mermaid', 'graph LR'];

  const sName = safeName(moduleName);
  lines.push(`    ${sName}["${safeLabel(moduleName)}"]`);

  const internal = dependencies.internal || [];
  for (let i = 0; i < Math.min(internal.length, 8); i++) {
    const depName = path.basename(internal[i], path.extname(internal[i]));
    const safeDep = safeName(depName) + i;
    lines.push(`    ${sName} --> ${safeDep}["${safeLabel(depName)}"]`);
  }

  const external = dependencies.external || [];
  if (external.length) {
    lines.push(`    ${sName} --> ext["外部依赖"]`);
    for (let i = 0; i < Math.min(external.length, 5); i++) {
      const safeDep = safeName(external[i]) + 'ext' + i;
      lines.push(`    ext --> ${safeDep}["${safeLabel(external[i])}"]`);
    }
  }

  lines.push('```');
  return lines.join('\n');
}

export function generateFileTreeDiagram(structure: StructureData): string {
  const modules = structure.modules || [];

  const lines = ['```mermaid', 'mindmap', '  root((项目))'];

  for (const mod of modules.slice(0, 10)) {
    const name = mod.name || 'unnamed';
    const filesCount = mod.files || 0;
    lines.push(`    ${safeLabel(name)}`);
    lines.push(`      ${filesCount} 个文件`);
  }

  lines.push('```');
  return lines.join('\n');
}

export function generateDataFlowDiagram(entryPoints: string[], modules: ModuleData[]): string {
  const lines = ['```mermaid', 'sequenceDiagram'];

  lines.push('    participant U as 用户');
  lines.push('    participant E as 入口');

  for (const mod of modules.slice(0, 3)) {
    const name = mod.name || 'Module';
    lines.push(`    participant ${safeName(name)} as ${safeLabel(name)}`);
  }

  lines.push('');
  lines.push('    U->>E: 请求');

  if (modules.length) {
    let prev = 'E';
    for (const mod of modules.slice(0, 3)) {
      const name = mod.name || 'Module';
      const sn = safeName(name);
      lines.push(`    ${prev}->>${sn}: 调用`);
      prev = sn;
    }
    lines.push(`    ${prev}-->>U: 响应`);
  } else {
    lines.push('    E-->>U: 响应');
  }

  lines.push('```');
  return lines.join('\n');
}

export function generateClassDiagram(classes: ClassData[]): string {
  const lines = ['```mermaid', 'classDiagram'];

  for (const cls of classes.slice(0, 10)) {
    const name = cls.name || 'Unknown';
    const sn = safeName(name);
    lines.push(`    class ${sn} {`);

    for (const prop of (cls.properties || []).slice(0, 5)) {
      lines.push(`        +${prop}`);
    }

    for (const method of (cls.methods || []).slice(0, 5)) {
      lines.push(`        +${method}()`);
    }

    lines.push('    }');
  }

  lines.push('```');
  return lines.join('\n');
}

export function loadStructure(wikiDir: string): StructureData | null {
  const structurePath = path.join(wikiDir, 'cache', 'structure.json');
  if (fs.existsSync(structurePath)) {
    try {
      return JSON.parse(fs.readFileSync(structurePath, 'utf-8'));
    } catch { /* ignore */ }
  }
  return null;
}
