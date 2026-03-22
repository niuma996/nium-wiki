/**
 * Local Badge Generation: SVG rendering + convenient factory functions
 * 本地徽章生成：SVG 渲染 + 便捷工厂函数
 * Avoids relying on external services like shields.io
 * 避免依赖 shields.io 等外网服务
 */

export interface BadgeOptions {
  label: string;
  message: string;
  color: string;
  labelColor?: string;
}

/**
 * Predefined color schemes / 预定义的颜色方案
 */
export const BADGE_COLORS = {
  blue: '#007ec6',
  green: '#4c1',
  brightgreen: '#44cc11',
  yellow: '#dfb317',
  orange: '#fe7d37',
  red: '#e05d44',
  lightgrey: '#9f9f9f',
  gray: '#555',
};

/**
 * 计算文本宽度（近似值，基于字符数）
 */
function estimateTextWidth(text: string): number {
  // English chars ~6px, numbers ~7px, Chinese chars ~12px / 英文字符约 6px，数字约 7px，中文字符约 12px
  let width = 0;
  for (const char of text) {
    if (/[\u4e00-\u9fa5]/.test(char)) {
      width += 12;
    } else if (/[0-9]/.test(char)) {
      width += 7;
    } else {
      width += 6;
    }
  }
  return width + 10; // add left/right padding / 加上左右 padding
}

/**
 * 生成 SVG 徽章（内联格式）
 */
export function generateBadgeSVG(options: BadgeOptions): string {
  const { label, message, color, labelColor = BADGE_COLORS.gray } = options;

  const resolvedColor = BADGE_COLORS[color as keyof typeof BADGE_COLORS] || color;
  const resolvedLabelColor = BADGE_COLORS[labelColor as keyof typeof BADGE_COLORS] || labelColor;

  const labelWidth = estimateTextWidth(label);
  const messageWidth = estimateTextWidth(message);
  const totalWidth = labelWidth + messageWidth;

  const labelX = labelWidth / 2;
  const messageX = labelWidth + messageWidth / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${message}">
  <title>${label}: ${message}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="${resolvedLabelColor}"/>
    <rect x="${labelWidth}" width="${messageWidth}" height="20" fill="${resolvedColor}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">
    <text aria-hidden="true" x="${labelX * 10}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${(labelWidth - 10) * 10}">${label}</text>
    <text x="${labelX * 10}" y="140" transform="scale(.1)" fill="#fff" textLength="${(labelWidth - 10) * 10}">${label}</text>
    <text aria-hidden="true" x="${messageX * 10}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${(messageWidth - 10) * 10}">${message}</text>
    <text x="${messageX * 10}" y="140" transform="scale(.1)" fill="#fff" textLength="${(messageWidth - 10) * 10}">${message}</text>
  </g>
</svg>`;
}

/**
 * 生成 Markdown 格式的内联徽章
 */
export function generateInlineBadge(options: BadgeOptions): string {
  const svg = generateBadgeSVG(options);
  const base64 = Buffer.from(svg).toString('base64');
  return `![${options.label}](data:image/svg+xml;base64,${base64})`;
}

/**
 * 生成简化的 HTML 徽章（备选方案）
 */
export function generateHTMLBadge(options: BadgeOptions): string {
  const { label, message, color, labelColor = 'gray' } = options;

  const resolvedColor = BADGE_COLORS[color as keyof typeof BADGE_COLORS] || color;
  const resolvedLabelColor = BADGE_COLORS[labelColor as keyof typeof BADGE_COLORS] || labelColor;

  return `<span style="display:inline-flex;align-items:center;font-family:Verdana,sans-serif;font-size:11px;line-height:1;white-space:nowrap;">
  <span style="background:${resolvedLabelColor};color:#fff;padding:3px 6px;border-radius:3px 0 0 3px;">${label}</span>
  <span style="background:${resolvedColor};color:#fff;padding:3px 6px;border-radius:0 3px 3px 0;">${message}</span>
</span>`;
}

/**
 * 生成纯文本徽章（最简方案）
 */
export function generateTextBadge(options: BadgeOptions): string {
  return `\`${options.label}: ${options.message}\``;
}

// ─── Convenient Factory Functions ────
// ─── 便捷工厂函数 ───

/**
 * Generate version badge / 生成版本徽章
 */
export function createVersionBadge(version: string): string {
  return generateInlineBadge({ label: 'version', message: version, color: 'blue' });
}

/**
 * Generate license badge / 生成许可证徽章
 */
export function createLicenseBadge(license: string): string {
  return generateInlineBadge({ label: 'license', message: license, color: 'green' });
}

/**
 * Generate build status badge / 生成构建状态徽章
 */
export function createBuildBadge(status: 'passing' | 'failing' | 'unknown' = 'passing'): string {
  const colorMap = { passing: 'brightgreen', failing: 'red', unknown: 'lightgrey' };
  return generateInlineBadge({ label: 'build', message: status, color: colorMap[status] });
}

/**
 * Generate test coverage badge / 生成测试覆盖率徽章
 */
export function createCoverageBadge(coverage: number): string {
  let color = 'red';
  if (coverage >= 80) color = 'brightgreen';
  else if (coverage >= 60) color = 'yellow';
  else if (coverage >= 40) color = 'orange';

  return generateInlineBadge({ label: 'coverage', message: `${coverage}%`, color });
}

/**
 * Generate language badge / 生成语言徽章
 */
export function createLanguageBadge(language: string): string {
  return generateInlineBadge({ label: 'language', message: language, color: 'blue' });
}

/**
 * Generate custom badge / 生成自定义徽章
 */
export function createCustomBadge(label: string, message: string, color: string = 'blue'): string {
  return generateInlineBadge({ label, message, color });
}

/**
 * Batch generate project badges / 批量生成项目徽章
 */
export interface ProjectBadges {
  version?: string;
  license?: string;
  build?: 'passing' | 'failing' | 'unknown';
  coverage?: number;
  language?: string;
  custom?: Array<{ label: string; message: string; color?: string }>;
}

export function generateProjectBadges(badges: ProjectBadges): string {
  const results: string[] = [];

  if (badges.version) results.push(createVersionBadge(badges.version));
  if (badges.license) results.push(createLicenseBadge(badges.license));
  if (badges.build) results.push(createBuildBadge(badges.build));
  if (badges.coverage !== undefined) results.push(createCoverageBadge(badges.coverage));
  if (badges.language) results.push(createLanguageBadge(badges.language));

  if (badges.custom) {
    for (const custom of badges.custom) {
      results.push(createCustomBadge(custom.label, custom.message, custom.color));
    }
  }

  return results.join('\n');
}
