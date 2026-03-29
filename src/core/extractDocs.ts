/**
 * Documentation Extraction Module
 * 文档提取模块
 * Extracts JSDoc/TSDoc/DocString comments from code files
 * 从代码文件中提取 JSDoc/TSDoc/DocString 注释
 */

import * as fs from 'fs';
import * as path from 'path';
import { languageHandlerManager } from '../language-handlers/index';
import { DocEntry } from '../language-handlers/base';

export { DocEntry };

/**
 * Extract documentation comments from a file
 * 从文件中提取文档注释
 * @param filePath File path / 文件路径
 */
export function extractDocsFromFile(filePath: string): DocEntry[] {
  if (!fs.existsSync(filePath)) return [];

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  // Use language handler manager to auto-detect language from file extension / 使用语言处理器管理器根据文件扩展名自动检测语言
  return languageHandlerManager.extractDocs(content, filePath);
}

/**
 * Extract documentation comments from multiple files
 * 从多个文件中提取文档注释
 * @param filePaths List of file paths / 文件路径列表
 */
export function extractDocsFromFiles(filePaths: string[]): DocEntry[] {
  const allEntries: DocEntry[] = [];

  for (const filePath of filePaths) {
    try {
      const entries = extractDocsFromFile(filePath);
      allEntries.push(...entries);
    } catch {
      // Ignore errors for individual files / 忽略单个文件的错误
    }
  }

  return allEntries;
}

/**
 * Extract documentation by language ID
 * 根据语言ID提取文档
 * @param filePath File path / 文件路径
 * @param languageId Language identifier (optional, auto-detected if not provided) / 语言标识符（可选，如果不提供则自动检测）
 */
export function extractDocsFromFileByLanguage(filePath: string, languageId?: string): DocEntry[] {
  if (!fs.existsSync(filePath)) return [];

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  if (languageId) {
    const handler = languageHandlerManager.getHandler(languageId);
    if (handler) {
      return handler.extractDocs(content, filePath);
    }
  }

  // Use language handler manager to auto-detect language from file extension / 使用语言处理器管理器根据文件扩展名自动检测语言
  return languageHandlerManager.extractDocs(content, filePath);
}

/**
 * Convert documentation entries to Markdown format
 * 将文档条目转换为 Markdown 格式
 * @param entries List of documentation entries / 文档条目列表
 */
export function docsToMarkdown(entries: DocEntry[]): string {
  const lines: string[] = [];

  const functions = entries.filter(e => e.type === 'function');
  const classes = entries.filter(e => e.type === 'class');
  const types = entries.filter(e => e.type === 'type' || e.type === 'interface');

  if (functions.length) {
    lines.push('## 函数\n');
    for (const func of functions) {
      lines.push(`### \`${func.name}\`\n`);
      lines.push(`${func.description}\n`);

      if (func.params.length) {
        lines.push('**参数:**\n');
        for (const param of func.params) {
          lines.push(`- \`${param.name}\` (${param.type}): ${param.description}`);
        }
        lines.push('');
      }

      if (func.returns) {
        lines.push(`**返回值:** ${func.returns}\n`);
      }

      if (func.examples.length) {
        lines.push('**示例:**\n');
        for (const example of func.examples) {
          lines.push('```');
          lines.push(example);
          lines.push('```');
        }
        lines.push('');
      }
    }
  }

  if (classes.length) {
    lines.push('## 类\n');
    for (const cls of classes) {
      lines.push(`### \`${cls.name}\`\n`);
      lines.push(`${cls.description}\n`);
    }
  }

  if (types.length) {
    lines.push('## 类型定义\n');
    for (const t of types) {
      lines.push(`### \`${t.name}\`\n`);
      lines.push(`${t.description}\n`);
    }
  }

  return lines.join('\n');
}

/**
 * Convert documentation entries to JSON format
 * 将文档条目转换为 JSON 格式
 * @param entries List of documentation entries / 文档条目列表
 */
export function docsToJson(entries: DocEntry[]): string {
  return JSON.stringify(entries, null, 2);
}

/**
 * Summarize documentation entries
 * 统计文档条目
 * @param entries List of documentation entries / 文档条目列表
 */
export function summarizeDocs(entries: DocEntry[]): {
  total: number;
  functions: number;
  classes: number;
  types: number;
  withExamples: number;
} {
  return {
    total: entries.length,
    functions: entries.filter(e => e.type === 'function').length,
    classes: entries.filter(e => e.type === 'class').length,
    types: entries.filter(e => e.type === 'type' || e.type === 'interface').length,
    withExamples: entries.filter(e => e.examples.length > 0).length,
  };
}
