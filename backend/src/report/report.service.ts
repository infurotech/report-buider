import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { Injectable } from '@nestjs/common';
import puppeteer from 'puppeteer';
import { TemplateService } from '../template/template.service';

function getPagedScriptPath(): string {
  const cwd = process.cwd();
  const candidates = [
    join(cwd, 'node_modules', 'pagedjs', 'dist', 'paged.polyfill.js'),
    join(cwd, 'client', 'node_modules', 'pagedjs', 'dist', 'paged.polyfill.js'),
  ];
  try {
    const require = createRequire(join(cwd, 'package.json'));
    const pkgPath = require.resolve('pagedjs/package.json');
    candidates.unshift(join(dirname(pkgPath), 'dist', 'paged.polyfill.js'));
  } catch {
    // pagedjs not resolvable from cwd, use path candidates only
  }
  const scriptPath = candidates.find((p) => existsSync(p));
  if (!scriptPath) {
    throw new Error(
      'pagedjs dist file not found. Run "npm install" at the project root so pagedjs is installed.',
    );
  }
  return scriptPath;
}

export type ReportFormat = 'html' | 'pdf';

export type HtmlOptions = { coverOnly?: boolean; bodyOnly?: boolean; paged?: boolean };

@Injectable()
export class ReportService {
  constructor(private readonly templateService: TemplateService) {}

  async generateHtml(
    templateName: string,
    content: Record<string, unknown>,
    config?: Record<string, unknown>,
    options?: HtmlOptions,
  ): Promise<string> {
    const template =
      await this.templateService.getCompiledTemplate(templateName);
    const safeConfig = config ? { ...config } : {};
    return template({ content, config: safeConfig, options: options ?? {} });
  }

  private async htmlToPdf(
    html: string,
    pageSize: string,
  ): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const buffer = await page.pdf({
        format: pageSize as 'A4' | 'A3' | 'A5' | 'A0' | 'A1' | 'A2' | 'A6' | 'Letter' | 'Legal' | 'Tabloid' | 'Ledger',
        printBackground: true,
      });
      return Buffer.from(buffer);
    } finally {
      await browser.close();
    }
  }

  private async htmlToPdfWithPaged(
    html: string,
    pageSize: string,
  ): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pagedScript = readFileSync(getPagedScriptPath(), 'utf-8');
      await page.addScriptTag({ content: pagedScript });
      await page.evaluate(async () => {
        if (typeof (window as unknown as { PagedPolyfill?: { preview: () => Promise<unknown> } }).PagedPolyfill?.preview === 'function') {
          await (window as unknown as { PagedPolyfill: { preview: () => Promise<unknown> } }).PagedPolyfill.preview();
        }
      });
      await page.evaluate(() => {
        const pages = document.querySelectorAll('.pagedjs_page');
        for (let i = 1; i < pages.length; i++) {
          const tables = pages[i].querySelectorAll('table');
          const prevTables = pages[i - 1].querySelectorAll('table');
          tables.forEach((table, j) => {
            if (table.querySelector('thead')) return;
            const srcTable = prevTables[j];
            const thead = srcTable?.querySelector('thead');
            if (thead) {
              table.insertBefore(thead.cloneNode(true), table.firstChild);
            }
          });
        }
      });
      await page.evaluate(() => {
        const footerText = document.body.getAttribute('data-footer') || '';
        const pages = document.querySelectorAll('.pagedjs_page');
        const total = pages.length;
        for (let i = 1; i < total; i++) {
          const footer = document.createElement('div');
          footer.className = 'paged-injected-footer';
          const left = document.createElement('span');
          left.textContent = footerText;
          const right = document.createElement('span');
          right.className = 'paged-page-num';
          right.textContent = `${i + 1} / ${total}`;
          footer.appendChild(left);
          footer.appendChild(right);
          pages[i].appendChild(footer);
        }
      });
      const buffer = await page.pdf({
        format: pageSize as 'A4' | 'A3' | 'A5' | 'A0' | 'A1' | 'A2' | 'A6' | 'Letter' | 'Legal' | 'Tabloid' | 'Ledger',
        printBackground: true,
      });
      return Buffer.from(buffer);
    } finally {
      await browser.close();
    }
  }

  async generatePdf(
    html: string,
    config?: Record<string, unknown>,
  ): Promise<Buffer> {
    const raw =
      (config?.pageSize as string)?.toUpperCase() || 'A4';
    const pageSize = [
      'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6',
      'Letter', 'Legal', 'Tabloid', 'Ledger',
    ].includes(raw) ? raw : 'A4';
    return this.htmlToPdf(html, pageSize);
  }

  async generate(
    templateName: string,
    content: Record<string, unknown>,
    config: Record<string, unknown> | undefined,
    format: ReportFormat,
    options?: HtmlOptions,
  ): Promise<string | Buffer> {
    if (format === 'pdf') {
      const pagedHtml = await this.generateHtml(templateName, content, config, { paged: true });
      const raw = (config?.pageSize as string)?.toUpperCase() || 'A4';
      const pageSize = [
        'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6',
        'Letter', 'Legal', 'Tabloid', 'Ledger',
      ].includes(raw) ? raw : 'A4';
      return this.htmlToPdfWithPaged(pagedHtml, pageSize);
    }
    const html = await this.generateHtml(templateName, content, config, options);
    return html;
  }
}
